
const frame=document.getElementById("contentFrame");

const playlist=[
  {title:"River Flows in You",artist:"Yiruma",src:"river-flows-in-you.mp4"},
  {title:"Golden Hour (Piano Cover)",artist:"Pianella Piano",src:"golden-hour-piano.mp4"},
  {title:"Pergi",artist:"Aizat Amdan",src:"pergi-aizat-amdan.mp4"}
];

const music=document.getElementById("music");
const musicBtn=document.getElementById("musicToggle");
const musicStatus=document.getElementById("musicStatus");
const trackSelect=document.getElementById("trackSelect");
const nextTrackBtn=document.getElementById("nextTrack");
const volume=document.getElementById("volume");

let trackIndex=Number(localStorage.getItem("memoryPlaylistTrack")||0);
if(!Number.isInteger(trackIndex)||trackIndex<0||trackIndex>=playlist.length) trackIndex=0;

playlist.forEach((track,index)=>{
  const option=document.createElement("option");
  option.value=String(index);
  option.textContent=`${track.title} — ${track.artist}`;
  trackSelect.appendChild(option);
});

function setMusicUI(){
  if(music.muted){
    musicBtn.textContent="🔇";
    musicStatus.textContent="Soundtrack muted";
  }else if(music.paused){
    musicBtn.textContent="♫";
    musicStatus.textContent="Tap to play soundtrack";
  }else{
    musicBtn.textContent="🔊";
    musicStatus.textContent=`Playing ${playlist[trackIndex].title}`;
  }
}

function setTrack(index,{play=false}={}){
  trackIndex=(index+playlist.length)%playlist.length;
  const track=playlist[trackIndex];
  localStorage.setItem("memoryPlaylistTrack",String(trackIndex));
  trackSelect.value=String(trackIndex);
  music.src=track.src;
  music.load();
  if(play){
    music.muted=false;
    music.play().catch(()=>{});
  }
  setMusicUI();
}

trackSelect.onchange=()=>setTrack(Number(trackSelect.value),{play:true});
nextTrackBtn.onclick=e=>{e.stopPropagation();setTrack(trackIndex+1,{play:true});};

volume.oninput=e=>{
  music.volume=Number(e.target.value);
  music.muted=music.volume===0;
  setMusicUI();
};

musicBtn.onclick=async e=>{
  e.stopPropagation();
  if(music.paused){
    music.muted=false;
    try{await music.play()}catch(err){}
  }else{
    music.muted=!music.muted;
  }
  setMusicUI();
};

music.addEventListener("ended",()=>setTrack(trackIndex+1,{play:true}));
music.addEventListener("play",setMusicUI);
music.addEventListener("pause",setMusicUI);
music.addEventListener("error",()=>{musicStatus.textContent="This soundtrack could not be loaded";});

music.volume=.30;
setTrack(trackIndex);

async function tryAutoplay(){
  try{
    music.muted=false;
    await music.play();
    setMusicUI();
  }catch(err){
    musicStatus.textContent="Tap anywhere to start soundtrack";
    const start=async()=>{
      try{
        music.muted=false;
        await music.play();
        setMusicUI();
      }catch(e){}
      document.removeEventListener("pointerdown",start);
      document.removeEventListener("keydown",start);
    };
    document.addEventListener("pointerdown",start,{once:true});
    document.addEventListener("keydown",start,{once:true});
  }
}
window.addEventListener("load",tryAutoplay);

function goHome(hash=""){
  frame.src="home.html"+hash;
  history.replaceState(null,"","#home"+(hash||""));
}
function goGallery(){
  frame.src="gallery.html";
  history.replaceState(null,"","#gallery");
}

window.addEventListener("message",e=>{
  const data=e.data||{};
  if(data.type!=="shell-nav") return;
  if(data.action==="gallery") goGallery();
  else if(data.action==="home") goHome();
  else if(data.action==="home-upload") goHome("#upload");
});

function bootFromHash(){
  const h=location.hash;
  if(h.startsWith("#gallery")) goGallery();
  else if(h.includes("upload")) goHome("#upload");
  else goHome();
}
bootFromHash();
