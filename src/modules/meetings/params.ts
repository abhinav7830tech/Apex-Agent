import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@/constants"
import {createLoader, parseAsInteger,parseAsString,parseAsStringEnum} from "nuqs/server"

import { MeetingStatus } from "./types"

export const FilterSearchParams ={
    search:parseAsString.withDefault("").withOptions({clearOnDefault:true}),
    page:parseAsInteger.withDefault(DEFAULT_PAGE).withOptions({clearOnDefault:true}),
    pageSize:parseAsInteger.withDefault(DEFAULT_PAGE_SIZE).withOptions({clearOnDefault:true}),
    status:parseAsStringEnum(Object.values(MeetingStatus)).withOptions({clearOnDefault:true}),
    agentId:parseAsString.withDefault("").withOptions({clearOnDefault:true})
        
    
}

export const loadSeacrhParams=createLoader(FilterSearchParams)