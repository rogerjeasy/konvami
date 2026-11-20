# The ffmpeg layer for compressed audio exports of recordings (5.6). Build the zip first:
#   sh infra/scripts/build-encoder-layer.sh
# A layer is unpacked under /opt, so the binary is at /opt/bin/ffmpeg (output path).

resource "aws_lambda_layer_version" "encoder" {
  layer_name               = "${var.name}-ffmpeg"
  description              = "Static ffmpeg (arm64, GPLv3) for MP3 and M4A exports"
  filename                 = var.zip_path
  source_code_hash         = filebase64sha256(var.zip_path)
  compatible_architectures = ["arm64"]
  compatible_runtimes      = ["python3.12"]
  license_info             = "GPL-3.0-or-later"
}
