"use client";

import { ErrorState } from "@/components/error-state";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CallProvider } from "../components/call-provider";
import { MeetingStatus } from "@/modules/meetings/types";

interface Props {
   
        meetingId: string;

    };
 export const CallView=({
    meetingId

 }:Props)=>{
    const trpc=useTRPC();
    const {data}=useSuspenseQuery(trpc.meetings.getOne.queryOptions({id:meetingId}));

    if (data.status === MeetingStatus.COMPLETED || data.status === MeetingStatus.PROCESSING) {
        return(
            <div className="flex h-screen item-center justify-center">
              <ErrorState
              title="Meeting has Ended"
              description="You can no longer join this meeting "/>
            </div>
        );
    }

    if (data.status === MeetingStatus.CANCELLED) {
        return(
            <div className="flex h-screen item-center justify-center">
              <ErrorState
              title="Meeting Cancelled"
              description="The host cancelled this meeting."/>
            </div>
        );
    }

    if (data.status === MeetingStatus.FAILED) {
        return(
            <div className="flex h-screen item-center justify-center">
              <ErrorState
              title="Meeting Unavailable"
              description="This meeting could not be completed and is no longer joinable."/>
            </div>
        );
    }
    
    return <CallProvider  meetingId={meetingId} meetingName={data.name}/>
};