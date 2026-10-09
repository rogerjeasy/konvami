# Accounts for the mobile app (spec §6.21.1, §10.2): one Cognito user pool and one public app
# client. Users sign up with email + password and verify the email with a 6-digit code
# (screens 2.3 and 2.4). The app calls the user-pool API directly; there is no client secret,
# because a secret cannot be kept inside a mobile app.
#
# Not here yet: Sign in with Apple and Google (they need the developer accounts' credentials and a
# hosted sign-in domain), a branded sender address (Amazon SES + own domain) and localised emails.

locals {
  # Account attributes the app may read and write. The same names are used in
  # apps/mobile/src/auth/cognito-provider.ts. Cognito can never remove a custom attribute from a
  # pool, so add one only when it is certain to be needed.
  custom_attributes = {
    # Coarse age group from the sign-up age check; the birthday itself never leaves the device.
    age_bracket = 16
    # "1|2026-10-09": the email-tips choice and the day it was made.
    tips_optin = 32
    # "v1|<ISO time>|openai=1,elevenlabs=1,bedrock=0": the AI consent record (Apple 5.1.2(i), GDPR).
    ai_consent = 256
  }

  standard_attributes = ["email", "given_name", "locale"]
  app_attributes = concat(
    local.standard_attributes,
    [for name in keys(local.custom_attributes) : "custom:${name}"],
  )
}

resource "aws_cognito_user_pool" "users" {
  name = "${var.name}-users"

  # Essentials: the default plan, free for the first 10,000 monthly active users. It adds refresh
  # token rotation and passwordless sign-in, which section 3 (Sign in) can use later.
  user_pool_tier = "ESSENTIALS"

  # The email address is the sign-in name. This cannot be changed after the pool is created.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  mfa_configuration   = "OFF"

  # Exactly the three rules shown as chips on screen 2.3: 8+ characters, a number, a symbol.
  password_policy {
    minimum_length                   = var.password_min_length
    require_numbers                  = true
    require_symbols                  = true
    require_lowercase                = false
    require_uppercase                = false
    temporary_password_validity_days = 7

    # A reset password cannot repeat a recent one (screen 3.7: "Use one you haven't used before").
    password_history_size = var.password_history_size
  }

  # People create their own accounts (public app, spec D4).
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # A changed email address must be verified before it replaces the old one.
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  # Cognito's built-in sender (no-reply@verificationemail.com): free and enough for dev, with a
  # low daily limit. A public launch needs Amazon SES with Konvami's own domain.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your ${var.app_name} code"
    email_message        = "Your ${var.app_name} verification code is {####}. It expires in 24 hours. If you did not create a ${var.app_name} account, you can ignore this email."
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 3
      max_length = 254
    }
  }

  dynamic "schema" {
    for_each = local.custom_attributes
    content {
      name                = schema.key
      attribute_data_type = "String"
      mutable             = true

      string_attribute_constraints {
        min_length = 1
        max_length = schema.value
      }
    }
  }
}

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "${var.name}-mobile"
  user_pool_id = aws_cognito_user_pool.users.id

  # A public client: the id ships inside the app, so there is nothing secret to protect.
  generate_secret = false

  # Email + password over TLS, and refresh. No admin, custom or SRP flows are needed by the app.
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  # Sign-in answers the same for "no such user" and "wrong password", so it cannot be used to
  # find out which emails have accounts.
  prevent_user_existence_errors = "ENABLED"

  # Sign-out revokes the refresh token on the server.
  enable_token_revocation = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = var.refresh_token_days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # The app can touch only its own attributes, not every attribute of the pool.
  read_attributes  = concat(local.app_attributes, ["email_verified"])
  write_attributes = local.app_attributes
}
