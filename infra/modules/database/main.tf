# Konvami's PostgreSQL (spec §10.2, §11): Aurora Serverless v2, reached only through the RDS
# Data API (SQL over HTTPS, authorised by IAM).
#
# Why this shape (design decision O1, docs/superpowers/specs/2026-10-09-onboarding-design.md):
# - With the Data API, Lambda stays outside the VPC, so it needs no NAT gateway to call OpenAI.
# - At min_capacity = 0 the database pauses when idle and costs storage only. The first query
#   afterwards takes about 15 seconds; services/api waits and retries.
# - The cluster sits in its own private network with no route in or out and a security group
#   without rules: nothing can open a database connection to it.
#
# The master password is created and rotated by RDS in Secrets Manager; it never appears in
# Terraform state. Before a public launch, give the API its own database role with fewer rights
# than the master user.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Aurora needs subnets in at least two zones.
  zones = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "db" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.name}-db" }
}

resource "aws_subnet" "db" {
  count = length(local.zones)

  vpc_id            = aws_vpc.db.id
  availability_zone = local.zones[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 2, count.index)

  tags = { Name = "${var.name}-db-${local.zones[count.index]}" }
}

resource "aws_db_subnet_group" "db" {
  name       = "${var.name}-db"
  subnet_ids = aws_subnet.db[*].id
}

# No ingress and no egress rules: the Data API does not go through this network.
resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "Konvami database: no network access, Data API only"
  vpc_id      = aws_vpc.db.id

  tags = { Name = "${var.name}-db" }
}

resource "aws_rds_cluster" "db" {
  cluster_identifier = "${var.name}-db"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.engine_version
  database_name      = var.database_name

  master_username             = "konvami_admin"
  manage_master_user_password = true

  enable_http_endpoint = true
  storage_encrypted    = true

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]

  serverlessv2_scaling_configuration {
    min_capacity             = var.min_capacity
    max_capacity             = var.max_capacity
    seconds_until_auto_pause = var.min_capacity == 0 ? var.seconds_until_auto_pause : null
  }

  backup_retention_period   = var.backup_retention_days
  copy_tags_to_snapshot     = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-db-final"

  lifecycle {
    # AWS applies minor versions in the maintenance window; Terraform must not roll them back.
    ignore_changes = [engine_version]
  }
}

resource "aws_rds_cluster_instance" "db" {
  identifier         = "${var.name}-db-1"
  cluster_identifier = aws_rds_cluster.db.id
  engine             = aws_rds_cluster.db.engine
  engine_version     = aws_rds_cluster.db.engine_version
  instance_class     = "db.serverless"

  auto_minor_version_upgrade = true

  lifecycle {
    ignore_changes = [engine_version]
  }
}
