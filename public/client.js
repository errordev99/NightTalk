const socket = io();
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const sendBtn = document.getElementById('sendBtn');
const msgInput = document.getElementById('msgInput');
const messages = document.getElementById('messages');
const videoToggle = document.getElementById('videoToggle');
const audioToggle = document.getElementById('audioToggle');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let pc = null;
let localStream = null;

function addMsg(text, who='me') {
  const div = document.createElement('div');
  div.className = 'bubble ' + (who==='me'?'me':'them');
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function setupMedia() {
  if (localStream) return;
  try {
    const constraints = { video: videoToggle.checked, audio: audioToggle.checked };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
  } catch (e) { console.warn(e); }
}

function createPeerConnection() {
  pc = new RTCPeerConnection({ iceServers:[{urls:['stun:stun.l.google.com:19302']}] });
  if (localStream) localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack = ev => { remoteVideo.srcObject = ev.streams[0]; };
  pc.onicecandidate = ev => { if(ev.candidate) socket.emit('signal',{type:'candidate',candidate:ev.candidate}); };
}

startBtn.onclick = async () => { startBtn.disabled=true; await setupMedia(); socket.emit('find_partner'); };
nextBtn.onclick = () => { socket.emit('next'); nextBtn.disabled=true; };
sendBtn.onclick = () => { const text=msgInput.value.trim(); if(!text) return; addMsg(text,'me'); socket.emit('text_message',text); msgInput.value=''; };
msgInput.addEventListener('keydown', e=>{ if(e.key==='Enter') sendBtn.click(); });
videoToggle.onchange = ()=>{ if(localStream) localStream.getVideoTracks().forEach(t=>t.enabled=videoToggle.checked); };
audioToggle.onchange = ()=>{ if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled=audioToggle.checked); };

socket.on('queueing',()=>{ nextBtn.disabled=true; });
socket.on('partner_found', async ({initiator}) => { nextBtn.disabled=false; createPeerConnection(); if(initiator){ const offer=await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('signal',{type:'offer',sdp:offer.sdp}); } });
socket.on('signal', async payload => {
  if(!pc) createPeerConnection();
  if(payload.type==='offer'){ await pc.setRemoteDescription({type:'offer',sdp:payload.sdp}); const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); socket.emit('signal',{type:'answer',sdp:ans.sdp}); }
  else if(payload.type==='answer'){ await pc.setRemoteDescription({type:'answer',sdp:payload.sdp}); }
  else if(payload.type==='candidate'){ try{ await pc.addIceCandidate(payload.candidate);}catch(e){console.warn(e);} }
});
socket.on('text_message', ({text})=>addMsg(text,'them'));
socket.on('partner_left', ()=>{ nextBtn.disabled=true; if(pc){ pc.getSenders().forEach(s=>s.track?.stop()); pc.close(); pc=null; } remoteVideo.srcObject=null; addMsg('[Stranger disconnected]','them'); });
window.addEventListener('beforeunload', ()=>{ try{ socket.disconnect(); }catch(e){} });
