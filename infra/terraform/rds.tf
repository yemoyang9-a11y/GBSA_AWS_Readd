# RDS PostgreSQL with Multi-AZ
resource "aws_db_instance" "postgres" {
  identifier = "${var.project_name}-postgres"

  # Engine configuration
  engine               = "postgres"
  engine_version       = "16.15"
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true

  # Database configuration
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # High Availability - Multi-AZ
  multi_az = true

  # Backup configuration
  backup_retention_period = 7
  backup_window          = "17:00-18:00" # 02:00-03:00 KST
  maintenance_window     = "tue:18:00-tue:19:00" # Wed 03:00-04:00 KST

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn

  # Protection settings
  deletion_protection      = false # Set to true for production
  skip_final_snapshot     = true   # Set to false for production
  final_snapshot_identifier = "${var.project_name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Auto minor version upgrade - OFF during demo period (architecture doc 2.3)
  auto_minor_version_upgrade = false

  # Performance Insights - disabled for demo
  performance_insights_enabled = false

  # Parameter group for pgvector
  parameter_group_name = aws_db_parameter_group.postgres.name

  tags = {
    Name = "${var.project_name}-postgres"
  }

  depends_on = [aws_iam_role_policy_attachment.rds_monitoring]
}

# Parameter Group for pgvector support
resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-postgres-params"
  family = "postgres16"

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"  # Static parameter requires reboot
  }

  # Note: pgvector is installed as an extension, not in shared_preload_libraries
  # Run: CREATE EXTENSION IF NOT EXISTS vector; in the database after creation

  parameter {
    name  = "log_statement"
    value = "mod" # Log all data-modifying statements
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries taking more than 1 second
  }

  tags = {
    Name = "${var.project_name}-postgres-params"
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-rds-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
