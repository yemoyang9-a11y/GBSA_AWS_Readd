# S3 Bucket for Frontend Static Assets
resource "aws_s3_bucket" "web" {
  bucket = "${var.project_name}-web-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project_name}-web"
    Purpose = "Frontend static assets"
  }
}

# Block all public access (CloudFront OAC will be used)
resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning
resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket for Assets (원문, DB 덤프, 평가 결과)
resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-assets-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name    = "${var.project_name}-assets"
    Purpose = "SourceFiles"
  }
}

# Block all public access for assets bucket
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning for assets bucket
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle policy for assets bucket
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}
