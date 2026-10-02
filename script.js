let currentUser = null;
let uploaded = [];
let memories = [];

const carousel = document.getElementById("carousel");
const gallery = document.getElementById("gallery");
const carouselEmpty = document.getElementById("carouselEmpty");
const galleryEmpty = document.getElementById("galleryEmpty");
const carouselHint = document.getElementById("carouselHint");
const form = document.getElementById("memoryForm");
const photo = document.getElementById("photo");
const statusEl = document.getElementById("status");
let x=0, paused=false, speed=.55, raf;

function esc(s=""){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function card(m,i){
  const tilt=((i%5)-2)*.35;
  const isMine = !!currentUser && !!m.owner_id && m.owner_id === currentUser.id;
  const removeButton = isMine
    ? `<button class="remove-memory" type="button" data-memory-id="${esc(m.id)}" data-photo-path="${esc(m.photo_path || "")}" aria-label="Delete photo: ${esc(m.name)}" title="Delete your photo"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m-10 0 1 14h10l1-14m-7 4v7m4-7v7"/></svg></button>`
    : "";
  return `<article class="memory-card" style="--tilt:${tilt}deg">${removeButton}<img src="${esc(m.image)}" alt="${esc(m.description||m.name)}" loading="lazy"><div class="card-meta"><h3>${esc(m.name)}</h3>${m.description?`<p>${esc(m.description)}</p>`:""}${m.date?`<small>${esc(m.date)}</small>`:""}</div></article>`;
}

function render(){
  memories=[...uploaded];
  const hasMemories=memories.length>0;
  carouselEmpty.hidden=hasMemories;
  galleryEmpty.hidden=hasMemories;
  carouselHint.hidden=!hasMemories;

  if(!hasMemories){
    carousel.innerHTML="";
    gallery.innerHTML="";
    x=0;
    return;
  }

  const set=memories.map((memory,index)=>card(memory,index)).join("");
  // Duplicate only real uploaded memories to create the seamless infinite track.
  carousel.innerHTML=set+set;
  gallery.innerHTML=set;
  x=0;
  carousel.style.transform="translate3d(0,0,0)";
}

function animate(){
  if(!paused && memories.length){
    x-=speed;
    const half=carousel.scrollWidth/2;
    if(half>0 && Math.abs(x)>=half) x+=half;
    carousel.style.transform=`translate3d(${x}px,0,0)`;
  }
  raf=requestAnimationFrame(animate);
}

carousel.addEventListener("mouseenter",()=>paused=true);
carousel.addEventListener("mouseleave",()=>paused=false);
document.getElementById("toggle").onclick=e=>{paused=!paused;e.target.textContent=paused?"Play":"Pause"};
document.getElementById("prev").onclick=()=>{if(memories.length)x+=330};
document.getElementById("next").onclick=()=>{if(memories.length)x-=330};

photo.onchange=()=>document.getElementById("fileName").textContent=photo.files[0]?.name||"No photo selected";

async function ensureUser(){
  const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
  if(sessionError) throw sessionError;
  if(session?.user){currentUser=session.user;return currentUser;}
  const {data,error}=await supabaseClient.auth.signInAnonymously();
  if(error) throw error;
  currentUser=data.user;
  return currentUser;
}

async function loadMemories({silent=false}={}){
  if(!silent) statusEl.textContent="Loading shared memories…";
  const {data,error}=await supabaseClient
    .from("memories")
    .select("id, owner_id, name, description, memory_date, photo_path, photo_url, created_at")
    .order("created_at",{ascending:false});
  if(error) throw error;
  uploaded=(data||[]).map(m=>({...m,date:m.memory_date || "",image:m.photo_url}));
  render();
  if(!silent) statusEl.textContent="";
}

function safeExtension(file){
  const raw=(file.name.split(".").pop()||"").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(raw)?raw:"jpg";
}

form.onsubmit=async e=>{
  e.preventDefault();
  const file=photo.files[0];
  if(!file)return;
  if(!file.type.startsWith("image/")){statusEl.textContent="Please choose an image file.";return;}
  if(file.size>4*1024*1024){statusEl.textContent="Please use a photo smaller than 4 MB.";return;}

  const submitBtn=form.querySelector('button[type="submit"]');
  submitBtn.disabled=true;
  submitBtn.textContent="Uploading…";
  statusEl.textContent="Uploading your memory…";

  let path="";
  try{
    await ensureUser();
    const extension=safeExtension(file);
    path=`${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const {error:uploadError}=await supabaseClient.storage
      .from("memories")
      .upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
    if(uploadError) throw uploadError;

    const {data:publicData}=supabaseClient.storage.from("memories").getPublicUrl(path);
    const publicUrl=publicData.publicUrl;

    const payload={
      owner_id:currentUser.id,
      name:document.getElementById("name").value.trim(),
      description:document.getElementById("description").value.trim() || null,
      memory_date:document.getElementById("date").value || null,
      photo_path:path,
      photo_url:publicUrl
    };

    const {error:dbError}=await supabaseClient.from("memories").insert(payload);
    if(dbError){await supabaseClient.storage.from("memories").remove([path]);throw dbError;}

    form.reset();
    document.getElementById("fileName").textContent="No photo selected";
    await loadMemories({silent:true});
    statusEl.textContent="Memory added — it is now part of the carousel!";
    document.getElementById("memories").scrollIntoView({behavior:"smooth"});
  }catch(err){
    console.error(err);
    statusEl.textContent=`Upload failed: ${err.message || "Please try again."}`;
  }finally{
    submitBtn.disabled=false;
    submitBtn.textContent="Add Memory";
  }
};

async function removeUploadedPhoto(e){
  const button=e.target.closest("[data-memory-id]");
  if(!button)return;
  const id=button.dataset.memoryId;
  const photoPath=button.dataset.photoPath;
  const memory=uploaded.find(m=>String(m.id)===String(id));
  if(!memory || !currentUser || memory.owner_id!==currentUser.id){
    statusEl.textContent="You can only delete photos that you uploaded on this device/session.";
    return;
  }
  if(!confirm("Remove this memory? This will permanently delete the photo and description."))return;

  button.disabled=true;
  statusEl.textContent="Deleting your memory…";
  try{
    if(photoPath){
      const {error:storageError}=await supabaseClient.storage.from("memories").remove([photoPath]);
      if(storageError) throw storageError;
    }
    const {error:dbError}=await supabaseClient.from("memories").delete().eq("id",id);
    if(dbError) throw dbError;
    await loadMemories({silent:true});
    statusEl.textContent="Memory removed. You can upload the correct photo anytime.";
  }catch(err){
    console.error(err);
    statusEl.textContent=`Delete failed: ${err.message || "Please try again."}`;
    button.disabled=false;
  }
}

gallery.addEventListener("click",removeUploadedPhoto);
carousel.addEventListener("click",removeUploadedPhoto);

/* ---------- Compact multi-song playlist ---------- */
const playlist=[
  {title:"Nostalgic Piano",artist:"AtlasAudio",src:"music.mp3"},
  {title:"Hotel Lobby Memories",artist:"Memory Mix",src:"hotel-lobby.mp3"},
  {title:"Golden Hour Journey",artist:"Memory Mix",src:"golden-hour.mp3"}
];

const music=document.getElementById("music");
const musicBtn=document.getElementById("musicToggle");
const musicStatus=document.getElementById("musicStatus");
const trackSelect=document.getElementById("trackSelect");
const nextTrackBtn=document.getElementById("nextTrack");
const volume=document.getElementById("volume");
let trackIndex=Number(localStorage.getItem("memoryPlaylistTrack") || 0);
if(!Number.isInteger(trackIndex) || trackIndex<0 || trackIndex>=playlist.length)trackIndex=0;

playlist.forEach((track,index)=>{
  const option=document.createElement("option");
  option.value=String(index);
  option.textContent=`${track.title} — ${track.artist}`;
  trackSelect.appendChild(option);
});

function setTrack(index,{play=false}={}){
  trackIndex=(index+playlist.length)%playlist.length;
  const track=playlist[trackIndex];
  localStorage.setItem("memoryPlaylistTrack",String(trackIndex));
  trackSelect.value=String(trackIndex);
  music.src=track.src;
  music.load();
  if(play){music.muted=false;music.play().catch(()=>{});}
  setMusicUI();
}

function setMusicUI(){
  if(music.muted){musicBtn.textContent="🔇";musicStatus.textContent="Soundtrack muted";}
  else if(music.paused){musicBtn.textContent="♫";musicStatus.textContent="Tap to play soundtrack";}
  else{musicBtn.textContent="🔊";musicStatus.textContent=`Playing ${playlist[trackIndex].title}`;}
}

async function tryAutoplay(){
  try{music.muted=false;await music.play();setMusicUI();}
  catch(err){
    musicStatus.textContent="Tap anywhere to start soundtrack";
    musicBtn.textContent="♫";
    const startOnFirstInteraction=async()=>{
      try{music.muted=false;await music.play();setMusicUI();}catch(e){}
      document.removeEventListener("pointerdown",startOnFirstInteraction);
      document.removeEventListener("keydown",startOnFirstInteraction);
    };
    document.addEventListener("pointerdown",startOnFirstInteraction,{once:true});
    document.addEventListener("keydown",startOnFirstInteraction,{once:true});
  }
}

trackSelect.onchange=()=>setTrack(Number(trackSelect.value),{play:true});
nextTrackBtn.onclick=e=>{e.stopPropagation();setTrack(trackIndex+1,{play:true});};
volume.oninput=e=>{
  music.volume=Number(e.target.value);
  music.muted=Number(e.target.value)===0;
  setMusicUI();
};

musicBtn.onclick=async e=>{
  e.stopPropagation();
  if(music.paused){music.muted=false;try{await music.play()}catch(err){}}
  else music.muted=!music.muted;
  setMusicUI();
};

// When a track finishes, automatically continue to the next track.
music.addEventListener("ended",()=>setTrack(trackIndex+1,{play:true}));
music.addEventListener("play",setMusicUI);
music.addEventListener("pause",setMusicUI);
music.addEventListener("error",()=>{musicStatus.textContent="This soundtrack could not be loaded";});

music.volume=.30;
setTrack(trackIndex);
window.addEventListener("load",tryAutoplay);

async function startApp(){
  render();
  animate();
  try{
    statusEl.textContent="Connecting to shared memories…";
    await ensureUser();
    await loadMemories();
  }catch(err){
    console.error(err);
    statusEl.textContent=`Could not connect to Supabase: ${err.message || "Check setup.sql and Anonymous Sign-Ins."}`;
  }

  setInterval(()=>loadMemories({silent:true}).catch(console.error),20000);
}

startApp();
