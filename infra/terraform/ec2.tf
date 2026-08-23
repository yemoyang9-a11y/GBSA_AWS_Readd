# Data source for Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# EC2 Instances (2 instances in different AZs)
resource "aws_instance" "app" {
  count = 2

  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.ec2_instance_type
  key_name      = var.ec2_key_name != "" ? var.ec2_key_name : null

  subnet_id                   = aws_subnet.public[count.index].id
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.ec2.name

  # Root volume
  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  # User data script for initial setup
  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    db_host              = aws_db_instance.postgres.address
    db_port              = 5432
    db_name              = var.db_name
    db_user              = var.db_username
    project_name         = var.project_name
    environment          = var.environment
    aws_region           = var.aws_region
    instance_index       = count.index
  }))

  # Enable detailed monitoring
  monitoring = true

  # Enable auto-recovery on system check failure
  maintenance_options {
    auto_recovery = "default"
  }

  tags = {
    Name = "${var.project_name}-app-${substr(var.availability_zones[count.index], -1, 1)}"
    Role = "Application"
    AZ   = var.availability_zones[count.index]
  }

  depends_on = [
    aws_db_instance.postgres,
    aws_iam_instance_profile.ec2
  ]
}

# Attach EC2 instances to ALB target group
resource "aws_lb_target_group_attachment" "app" {
  count = 2

  target_group_arn = aws_lb_target_group.app.arn
  target_id        = aws_instance.app[count.index].id
  port             = 80
}

# CloudWatch Alarms for EC2 System Check Failures
resource "aws_cloudwatch_metric_alarm" "ec2_system_check" {
  count = 2

  alarm_name          = "${var.project_name}-ec2-${count.index}-system-check"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  period              = "60"
  statistic           = "Maximum"
  threshold           = "1"
  alarm_description   = "Trigger auto-recovery on system check failure"
  alarm_actions       = ["arn:aws:automate:${var.aws_region}:ec2:recover"]

  dimensions = {
    InstanceId = aws_instance.app[count.index].id
  }
}

# CloudWatch Alarms for EC2 Instance Check Failures
resource "aws_cloudwatch_metric_alarm" "ec2_instance_check" {
  count = 2

  alarm_name          = "${var.project_name}-ec2-${count.index}-instance-check"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "StatusCheckFailed_Instance"
  namespace           = "AWS/EC2"
  period              = "60"
  statistic           = "Maximum"
  threshold           = "1"
  alarm_description   = "Instance check failed - requires manual intervention"

  dimensions = {
    InstanceId = aws_instance.app[count.index].id
  }
}

# CloudWatch Alarm for Unhealthy Hosts in ALB
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.project_name}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Maximum"
  threshold           = "1"
  alarm_description   = "One or more instances are unhealthy"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }
}
