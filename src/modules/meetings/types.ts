import { inferRouterOutputs} from "@trpc/server"
import type {AppRouter} from "@/trpc/routers/_app"


export type MeetingGetOne=inferRouterOutputs<AppRouter>["meetings"]["getOne"];
export type MeetingGetMany=inferRouterOutputs<AppRouter>["meetings"]["getMany"]["items"];
export enum MeetingStatus {
    UPCOMING = 'upcoming',
    ACTIVE = 'active',
    COMPLETED = 'completed',
    PROCESSING = 'processing',
    CANCELLED = 'cancelled'
}


export type StreamTranscriptItem={
    speaker_id:string;
    type:string;
    text:string;
    start_ts:number;
    shop_ts:number;
}