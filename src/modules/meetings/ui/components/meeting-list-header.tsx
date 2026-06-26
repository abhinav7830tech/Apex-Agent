"use client";

import { Button } from "@/components/ui/button";
import { PlusIcon, XCircleIcon } from "lucide-react";
import { NewMeeetingDialog } from "./new-meeting-dialog";
import { useState } from "react";
import { MeetingsSearchFilter } from "./meetings-search-fliters";
import { StatusFilter } from "./status-filter";
import { AgentIdFilter } from "./agent-id-filter";
import { useMeetingsFilter } from "../../hooks/use-meetings-filter";
import { ScrollArea } from "@/components/ui/scroll-area";

export const MeetingsListHeader = () => {
    const [filters, setFilters] = useMeetingsFilter();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const clearFilters = () => {
        setFilters({ 
            search: '', 
            status: null, 
            agentId: '',
            page: 1 
        });
    };

    const isAnyFilterModified = 
        filters.search !== '' || 
        filters.status !== null||
        filters.agentId !== '';
  return (
    <>
    <NewMeeetingDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}/>
      <div className="py-6 px-4 md:py-8 flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-2xl font-bold text-slate-700">My Meetings</h5>
            <div className="mt-1 h-1 w-16 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full"></div>
          </div>
          <Button 
            onClick={() => setIsDialogOpen(true)}
            className="bg-green-500 hover:bg-green-600 text-white font-medium px-4 py-2 rounded-lg shadow-md shadow-green-100"
          >
            <PlusIcon className="size-4 mr-2" />
            New Meeting
          </Button>
        </div>
       
        <ScrollArea className="w-full whitespace-nowrap pb-2">
          <div className="flex items-center gap-x-2 p-1 w-max">
            <MeetingsSearchFilter/>
            <StatusFilter/>
            <AgentIdFilter/>
            {isAnyFilterModified && (
              <Button 
                variant="outline" 
                onClick={clearFilters}
                className="shrink-0 border-green-200 text-green-600 hover:bg-green-50"
              >
                <XCircleIcon className="size-4 mr-1"/>
                Clear
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
};
