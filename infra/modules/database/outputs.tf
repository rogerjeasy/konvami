output "cluster_arn" {
  description = "The cluster, as the Data API names it."
  value       = aws_rds_cluster.db.arn
}

output "secret_arn" {
  description = "The Secrets Manager secret holding the database credentials (managed by RDS). The Data API reads it; no code ever sees the password."
  value       = aws_rds_cluster.db.master_user_secret[0].secret_arn
}

output "database_name" {
  value = aws_rds_cluster.db.database_name
}

output "instance_id" {
  description = "The database instance. Depend on it before running SQL: a cluster without an instance cannot answer."
  value       = aws_rds_cluster_instance.db.id
}
