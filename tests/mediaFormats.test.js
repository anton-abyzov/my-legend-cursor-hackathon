const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSupportedImageUpload,
  isSupportedMediaUpload,
  isSupportedVideoUpload,
  isImagePath,
  supportedFormatsLabel
} = require("../src/engine/videoFormats");

test("isSupportedMediaUpload accepts common photos and videos", () => {
  assert.equal(isSupportedVideoUpload("clip.mp4", "video/mp4"), true);
  assert.equal(isSupportedImageUpload("shot.jpg", "image/jpeg"), true);
  assert.equal(isSupportedMediaUpload("shot.png", "image/png"), true);
  assert.equal(isSupportedMediaUpload("clip.mov", "video/quicktime"), true);
  assert.equal(isSupportedMediaUpload("notes.txt", "text/plain"), false);
});

test("isImagePath detects still assets by extension", () => {
  assert.equal(isImagePath("/tmp/hero.webp"), true);
  assert.equal(isImagePath("/tmp/hero.mp4"), false);
});

test("supportedFormatsLabel mentions photos", () => {
  assert.match(supportedFormatsLabel(), /PNG|JPG|photo/i);
});
