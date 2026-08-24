# SPA 라우팅 폴백 — 확장자 없는 요청(React Router 라우트)을 index.html로 넘긴다.
# default_cache_behavior(S3 오리진)에만 붙여서 /api/* 동작에는 영향 없다.
resource "aws_cloudfront_function" "spa_routing" {
  name    = "${var.project_name}-spa-routing"
  runtime = "cloudfront-js-2.0"
  comment = "SPA fallback: extensionless requests -> /index.html"
  publish = true
  code    = file("${path.module}/functions/spa-routing.js")
}

# CloudFront Origin Access Control for S3
resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.project_name}-web-oac"
  description                       = "OAC for S3 static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} distribution"
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # US, Europe, Asia, Middle East, and Africa

  # S3 Origin for static assets
  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.web.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  # ALB Origin for API
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "ALB-${aws_lb.main.name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # A-plan: HTTP to ALB
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
      origin_keepalive_timeout = 60
    }

    # Custom header for origin verification (architecture doc 2.4)
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_secret.result
    }
  }

  # Default behavior - S3 static assets
  default_cache_behavior {
    target_origin_id       = "S3-${aws_s3_bucket.web.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routing.arn
    }
  }

  # API behavior - /api/* to ALB
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "ALB-${aws_lb.main.name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false # Disable compression for SSE (architecture doc 2.4)

    # Disable caching for API
    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Use default CloudFront certificate (A-plan)
  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  # Uncomment for B-plan (custom domain)
  # viewer_certificate {
  #   acm_certificate_arn      = aws_acm_certificate.cloudfront.arn
  #   ssl_support_method       = "sni-only"
  #   minimum_protocol_version = "TLSv1.2_2021"
  # }
  # aliases = ["app.yourdomain.com"]

  tags = {
    Name = "${var.project_name}-distribution"
  }

  depends_on = [aws_s3_bucket.web, aws_lb.main]
}

# S3 Bucket Policy for CloudFront OAC
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.web.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

# Random password for origin verification
resource "random_password" "origin_secret" {
  length  = 32
  special = true
}

# Store origin secret in SSM Parameter Store
resource "aws_ssm_parameter" "origin_secret" {
  name        = "/${var.project_name}/${var.environment}/cloudfront-origin-secret"
  description = "Secret header value for CloudFront origin verification"
  type        = "SecureString"
  value       = random_password.origin_secret.result

  tags = {
    Name = "${var.project_name}-origin-secret"
  }
}
