# PostgreSQL 17 on RDS: private, encrypted, backed up daily with point-in-time recovery, and
# protected from accidental deletion. Single-AZ to keep a demo cheap; see docs/runbooks.

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "wageguard"
  username = "wageguard"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = var.db_backup_retention_days
  backup_window              = "16:00-17:00" # 02:00-03:00 AEST
  maintenance_window         = "sun:17:30-sun:18:30"
  copy_tags_to_snapshot      = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name}-final"
  auto_minor_version_upgrade = true

  enabled_cloudwatch_logs_exports = ["postgresql"]
}

# Connection strings live in Secrets Manager and are injected into the tasks at start; they never
# appear in task definitions, images or logs. TLS is verified against the Amazon RDS certificate
# bundle baked into the API image (/etc/ssl/rds/global-bundle.pem). The runtime (node-postgres) and
# the migration engine (Prisma) spell the TLS options differently, so each gets its own URL.
locals {
  database_base = "postgresql://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:5432/${aws_db_instance.main.db_name}"
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "${local.database_base}?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem"
}

resource "aws_secretsmanager_secret" "migrate_database_url" {
  name                    = "${local.name}/migrate-database-url"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "migrate_database_url" {
  secret_id     = aws_secretsmanager_secret.migrate_database_url.id
  secret_string = "${local.database_base}?sslmode=require&sslcert=/etc/ssl/rds/global-bundle.pem&sslaccept=strict"
}