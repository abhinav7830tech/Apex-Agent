import React from 'react';
import { EmptyState } from "@/components/empty-state";
// Unused imports removed


export const ProcessingState = () => {

    return (
        <div className="bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 item-center">
            <EmptyState
                image="/processing.svg"
                title='Meeting completed'
                description='This Meeting was completed, a Summary will be appear soon'
            />
        </div>
    )
}