"use client";
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useParams } from 'next/navigation';
import React from 'react'
import { usePlayground } from '@/features/playground/hooks/usePlayground';

const Page = () => {
    const {id} = useParams<{id:string}>();
    const {playgroundData,templateData,isLoading,error,saveTemplateData} = usePlayground(id);
    console.log(templateData);
    console.log(playgroundData);
  return (
    <TooltipProvider>
        <>
        {/* {Todo : template file tree} */}
        <SidebarInset>
          <header className='flex h-16 shrink-0 items-center gap-2 border-b px-4'>
            <SidebarTrigger className='-ml-1'/>
            <Separator orientation = 'vertical' className='mr-2 h-4'/>
            <div className='flex flex-1 items-center gap-2'>
              <div className='flex flex-col flex-1'>
                 {playgroundData?.title || "Code Playground"}
              </div>
            </div>
          </header>
        </SidebarInset>
        </>
    </TooltipProvider>
  )
}

export default Page