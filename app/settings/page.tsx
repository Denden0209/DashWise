"use client";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { updateUserProfile } from "@/lib/db";
import Nav from "@/components/Nav";

export default function SettingsPage() {
  const router=useRouter();
  const {user,profile,refreshProfile}=useAuth();
  const [bizName,setBizName]=useState(profile?.bizName||"");
  const [tone,setTone]=useState(profile?.advisorTone||"balanced");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  async function handleSave(){
    if(!user)return;setSaving(true);
    await updateUserProfile(user.uid,{bizName,advisorTone:tone});
    await refreshProfile();
    setSaved(true);setSaving(false);setTimeout(()=>setSaved(false),2000);
  }

  const planColor:Record<string,{bg:string;color:string}>={free:{bg:"#f5f5f7",color:"#86868b"},pro:{bg:"#e8f0fe",color:"#0071e3"},team:{bg:"#f3e8ff",color:"#af52de"},business:{bg:"#fff3e0",color:"#ff9f0a"}};
  const pc=planColor[profile?.subscription||"free"];

  return (
    <div style={{minHeight:"100vh",background:"#f5f5f7"}}>
      <Nav/>
      <main style={{maxWidth:680,margin:"0 auto",padding:"36px 24px"}}>
        <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.5px",color:"#1d1d1f",marginBottom:28}}>Settings</h1>

        <div style={{background:"#fff",border:"1px solid #e5e5ea",borderRadius:18,padding:24,marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
          <h2 style={{fontSize:15,fontWeight:600,color:"#1d1d1f",marginBottom:20}}>Business Profile</h2>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div>
              <label style={{display:"block",fontSize:12,fontWeight:500,color:"#515154",marginBottom:6}}>Business name</label>
              <input value={bizName} onChange={e=>setBizName(e.target.value)} style={{width:"100%",background:"#fff",border:"1px solid #e5e5ea",borderRadius:10,padding:"11px 14px",fontSize:14,color:"#1d1d1f"}}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:12,fontWeight:500,color:"#515154",marginBottom:8}}>Advisor tone</label>
              <div style={{display:"flex",gap:8}}>
                {["direct","balanced","coaching"].map(t=>(
                  <button key={t} onClick={()=>setTone(t)} style={{flex:1,padding:"10px",borderRadius:10,fontSize:13,fontWeight:500,background:tone===t?"#0071e3":"#f5f5f7",border:tone===t?"1px solid #0071e3":"1px solid #e5e5ea",color:tone===t?"#fff":"#515154",cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} style={{background:"#0071e3",color:"#fff",fontWeight:600,fontSize:14,padding:"12px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              {saved?"✓ Saved!":saving?"Saving...":"Save changes"}
            </button>
          </div>
        </div>

        <div style={{background:"#fff",border:"1px solid #e5e5ea",borderRadius:18,padding:24,marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
          <h2 style={{fontSize:15,fontWeight:600,color:"#1d1d1f",marginBottom:16}}>Subscription</h2>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <span style={{fontSize:13,fontWeight:600,padding:"4px 12px",borderRadius:20,background:pc.bg,color:pc.color,textTransform:"capitalize"}}>{profile?.subscription||"free"} plan</span>
            <span style={{fontSize:13,color:"#86868b"}}>{profile?.uploadsCount||0} total analyses</span>
          </div>
          {profile?.subscription==="free"&&(
            <div style={{background:"#e8f0fe",border:"1px solid #d1e4ff",borderRadius:12,padding:16}}>
              <div style={{fontWeight:600,fontSize:14,color:"#0071e3",marginBottom:4}}>Upgrade to Pro — $29/month</div>
              <div style={{fontSize:13,color:"#515154",marginBottom:12}}>Unlimited analyses, business memory, and full advisor access.</div>
              <button style={{background:"#0071e3",color:"#fff",fontSize:13,fontWeight:600,padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit"}}>Upgrade (coming soon)</button>
            </div>
          )}
        </div>

        <div style={{background:"#fff",border:"1px solid #e5e5ea",borderRadius:18,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
          <h2 style={{fontSize:15,fontWeight:600,color:"#1d1d1f",marginBottom:16}}>Account</h2>
          <div style={{fontSize:13,color:"#86868b",marginBottom:16}}>Signed in as <span style={{color:"#1d1d1f",fontWeight:500}}>{user?.email}</span></div>
          <button onClick={async()=>{await signOut(auth);router.push("/");}} style={{background:"#fff2f2",border:"1px solid #ffd6d6",color:"#ff3b30",fontSize:13,fontWeight:500,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontFamily:"inherit"}}>
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
