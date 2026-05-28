"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserFolders, getFolderFiles, BusinessFolder, FolderFile } from "@/lib/db";
import Nav from "@/components/Nav";

type FolderWithFiles = BusinessFolder & { files: FolderFile[] };
const fileIcon=(n:string)=>{const e=n.split(".").pop()?.toLowerCase()||"";return({csv:"📊",xlsx:"📗",xls:"📗",pdf:"📄",txt:"📝",json:"🔧"} as Record<string,string>)[e]||"📎";};
const fmtSize=(b:number)=>b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":(b/1048576).toFixed(1)+" MB";

export default function HistoryPage() {
  const {user}=useAuth();
  const [folders,setFolders]=useState<FolderWithFiles[]>([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});

  useEffect(()=>{
    if(!user)return;
    (async()=>{
      const list=await getUserFolders(user.uid);
      const wf=await Promise.all(list.map(async f=>({...f,files:await getFolderFiles(user.uid,f.id!)})));
      setFolders(wf);
      if(wf.length>0)setExpanded({[wf[0].id!]:true});
      setLoading(false);
    })();
  },[user]);

  return (
    <div style={{minHeight:"100vh",background:"#f5f5f7"}}>
      <Nav/>
      <main style={{maxWidth:800,margin:"0 auto",padding:"36px 24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.5px",color:"#1d1d1f",marginBottom:4}}>Upload History</h1>
            <p style={{fontSize:14,color:"#86868b"}}>{folders.length} folders · {folders.reduce((s,f)=>s+f.files.length,0)} files</p>
          </div>
          <Link href="/files" style={{background:"#0071e3",color:"#fff",fontWeight:600,fontSize:13,padding:"10px 20px",borderRadius:980,textDecoration:"none"}}>+ Upload Files</Link>
        </div>

        {loading&&<div style={{textAlign:"center",padding:60,color:"#86868b"}}>Loading...</div>}
        {!loading&&folders.length===0&&(
          <div style={{background:"#fff",border:"1px solid #e5e5ea",borderRadius:20,padding:"56px 40px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:40,marginBottom:14}}>📂</div>
            <h3 style={{fontSize:18,fontWeight:600,color:"#1d1d1f",marginBottom:8}}>No uploads yet</h3>
            <p style={{fontSize:14,color:"#86868b",marginBottom:20}}>Create a folder and upload your first business file.</p>
            <Link href="/files" style={{background:"#0071e3",color:"#fff",fontWeight:600,fontSize:14,padding:"11px 26px",borderRadius:980,textDecoration:"none"}}>Go to Files →</Link>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {folders.map(folder=>{
            const open=!!expanded[folder.id!];
            return(
              <div key={folder.id} style={{background:"#fff",border:"1px solid #e5e5ea",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
                <button onClick={()=>setExpanded(p=>({...p,[folder.id!]:!p[folder.id!]}))} style={{width:"100%",display:"flex",alignItems:"center",gap:14,padding:"16px 20px",background:"none",border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                  <span style={{fontSize:22}}>📁</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14,color:"#1d1d1f"}}>{folder.bizName}</div>
                    <div style={{fontSize:12,color:"#86868b",marginTop:2}}>{folder.files.length} file{folder.files.length!==1?"s":""}{folder.lastAnalysisSummary?" · analyzed":""}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {folder.lastAnalysisSummary&&<span style={{fontSize:11,background:"#f0faf4",color:"#34c759",border:"1px solid #c8f0d8",padding:"2px 10px",borderRadius:20,fontWeight:500}}>✓ Analyzed</span>}
                    <span style={{color:"#86868b",fontSize:11}}>{open?"▲":"▼"}</span>
                  </div>
                </button>
                {open&&folder.lastAnalysisSummary&&(
                  <div style={{margin:"0 20px 12px",background:"#e8f0fe",border:"1px solid #d1e4ff",borderRadius:10,padding:14}}>
                    <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",color:"#0071e3",marginBottom:6}}>Last Analysis</div>
                    <p style={{fontSize:13,color:"#515154",lineHeight:1.5}}>{folder.lastAnalysisSummary}</p>
                    <Link href="/files" style={{display:"block",marginTop:8,fontSize:12,color:"#0071e3",textDecoration:"none",fontWeight:500}}>Re-analyze →</Link>
                  </div>
                )}
                {open&&(
                  <div style={{borderTop:"1px solid #f5f5f7"}}>
                    {folder.files.length===0?(
                      <div style={{padding:"12px 20px",fontSize:13,color:"#86868b"}}>No files. <Link href="/files" style={{color:"#0071e3"}}>Upload now →</Link></div>
                    ):folder.files.map(file=>(
                      <div key={file.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 20px",borderBottom:"1px solid #f9f9fb"}}>
                        <span style={{fontSize:18}}>{fileIcon(file.name)}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:"#1d1d1f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{file.name}</div>
                          <div style={{fontSize:11,color:"#86868b",marginTop:2}}>{fmtSize(file.size)} · {file.type.toUpperCase()}{file.sheets?.length?` · ${file.sheets.length} sheets`:""}</div>
                        </div>
                        <span style={{fontSize:11,background:file.status==="ready"?"#f0faf4":"#f5f5f7",color:file.status==="ready"?"#34c759":"#86868b",border:`1px solid ${file.status==="ready"?"#c8f0d8":"#e5e5ea"}`,padding:"2px 10px",borderRadius:20,fontWeight:500,flexShrink:0}}>
                          {file.status==="ready"?"✓ Ready":file.status}
                        </span>
                      </div>
                    ))}
                    <div style={{padding:"11px 20px",display:"flex",gap:16}}>
                      <Link href="/files" style={{fontSize:12,color:"#0071e3",textDecoration:"none",fontWeight:500}}>Open in Files →</Link>
                      <span style={{color:"#e5e5ea"}}>|</span>
                      <Link href={`/advisor?q=${encodeURIComponent(`Tell me about my ${folder.bizName} business`)}`} style={{fontSize:12,color:"#0071e3",textDecoration:"none",fontWeight:500}}>Ask Advisor →</Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
