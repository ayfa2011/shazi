import {$,toast} from "./utils.js";
import {storage,rtdb} from "./firebase.js";
import {ref,uploadBytes,getDownloadURL} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import {ref as dbRef,onValue,set,update} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
let player,stateRef;
export function initMusic(){
 player=$("#audio-player");stateRef=dbRef(rtdb,"couples/our-little-world/music");
 onValue(stateRef,s=>{const x=s.val()||{};if(x.url && player.src!==x.url){player.src=x.url;$("#track-name").textContent=x.name||"Our song";}if(x.playing && player.paused){player.play().catch(()=>{})}if(!x.playing&&!player.paused)player.pause();if(typeof x.time==="number"&&Math.abs(player.currentTime-x.time)>2)player.currentTime=x.time;});
 $("#play-music").onclick=async()=>{await player.play();await update(stateRef,{playing:true,time:player.currentTime})};
 $("#pause-music").onclick=async()=>{player.pause();await update(stateRef,{playing:false,time:player.currentTime})};
 player.addEventListener("timeupdate",()=>{if(!player.paused)update(stateRef,{time:player.currentTime,playing:true})});
 $("#music-upload").onchange=async e=>{const file=e.target.files[0];if(!file)return;toast("Uploading our song…");const r=ref(storage,`couples/our-little-world/music/${Date.now()}-${file.name}`);await uploadBytes(r,file);const url=await getDownloadURL(r);await set(stateRef,{url,name:file.name,playing:false,time:0});toast("Song uploaded ♫")};
}
