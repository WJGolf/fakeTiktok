// ---- Upload sheet ----

import { MAX_FILE_SIZE_MB } from './config.js';
import { session, myProfile } from './state.js';
import { uploadFile, insertVideoRow } from './api.js';
import { fetchVideos } from './feed.js';

var selectedFile = null;
var _openLoginCb = null;

export function setUploadCallbacks(openLogin) {
  _openLoginCb = openLogin;
}

export function openUpload() {
  if (!session || !myProfile) {
    if (_openLoginCb) _openLoginCb();
    return;
  }
  selectedFile = null;
  document.getElementById('upTitle').value = '';
  document.getElementById('upFile').value  = '';
  document.getElementById('upErr').textContent = '';
  document.getElementById('dropLabel').textContent = 'แตะเพื่อเลือกไฟล์ (วิดีโอ mp4/webm หรือรูป jpg/png/gif ฯลฯ)';
  document.getElementById('dropZone').classList.remove('has-file');
  document.getElementById('upAuthorNote').textContent = myProfile.username;
  document.getElementById('uploadOverlay').classList.add('show');
}

export function closeUpload() {
  document.getElementById('uploadOverlay').classList.remove('show');
}

function handleFileSelect(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    document.getElementById('upErr').textContent = 'ไฟล์ใหญ่เกิน ' + MAX_FILE_SIZE_MB + ' MB';
    return;
  }
  selectedFile = file;
  document.getElementById('dropLabel').textContent = file.name;
  document.getElementById('dropZone').classList.add('has-file');
  document.getElementById('upErr').textContent = '';
}

function submitUpload() {
  var title = document.getElementById('upTitle').value.trim();
  var errEl = document.getElementById('upErr');
  if (!title)        { errEl.textContent = 'กรุณาใส่ชื่อคลิป/รูป';   return; }
  if (!selectedFile) { errEl.textContent = 'กรุณาเลือกไฟล์';         return; }
  if (!session)      { errEl.textContent = 'กรุณาเข้าสู่ระบบก่อน';    return; }

  var submitBtn = document.getElementById('upSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังอัปโหลด...';
  errEl.textContent = '';

  var isImage = selectedFile.type.startsWith('image/');
  var prefix  = isImage ? 'img_' : 'vid_';

  uploadFile(selectedFile, prefix).then(function(publicUrl) {
    return insertVideoRow({
      title:      title,
      video_url:  publicUrl,
      author:     myProfile.username,
      user_id:    session.user.id,
      likes:      0,
      media_type: isImage ? 'image' : 'video'
    });
  }).then(function() {
    closeUpload();
    fetchVideos();
  }).catch(function(e) {
    errEl.textContent = e.message || 'อัปโหลดไม่สำเร็จ';
  }).finally(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'อัปโหลด';
  });
}

// ---- event binding ----
export function bindUploadEvents() {
  document.getElementById('upFile').onchange = function() {
    if (this.files[0]) handleFileSelect(this.files[0]);
  };
  document.getElementById('upCancel').onclick = closeUpload;
  document.getElementById('upSubmit').onclick = submitUpload;
  // ปิดเมื่อคลิกพื้นหลัง
  document.getElementById('uploadOverlay').onclick = function(e) {
    if (e.target === this) closeUpload();
  };
  // drag & drop
  var dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('has-file'); });
  dz.addEventListener('dragleave', function()  { if (!selectedFile) dz.classList.remove('has-file'); });
  dz.addEventListener('drop', function(e) {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });
}
