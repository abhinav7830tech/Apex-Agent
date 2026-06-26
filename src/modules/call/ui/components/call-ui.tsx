import { useState } from "react";
import { StreamTheme, useCall } from "@stream-io/video-react-sdk";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
    meetingName: string;
}

export const CallUI =({meetingName}:Props)=>{
   const call=useCall();
   const [show, setShow]=useState<"lobby" | "call" | "ended"> ("lobby");

   const handlejoin = async () =>{
    if(!call) return;

    await call.join();

    setShow("call");
   }
   
   const handleleave = async () => {
     try {
       if (!call) {
         setShow("ended");
         return;
       }
       
       // Check if the call is still active before trying to leave
       if (call.state.callingState !== 'left') {
         await call.leave();
       }
       
       setShow("ended");
     } catch (error) {
       console.error('Error leaving call:', error);
       // Still proceed to show the ended state even if there's an error
       setShow("ended");
     }
   };

return(
    <StreamTheme className="h-full">
        {show=== "lobby"  && <CallLobby onJoin={handlejoin}/>}
        {show=== "call"  && <CallActive onLeave={handleleave} meetingName={meetingName}/>}
        {show=== "ended"  && <CallEnded/>}
    
    </StreamTheme>
)
}
