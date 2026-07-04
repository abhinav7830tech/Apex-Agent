import { SignInView } from "@/modules/auth/ui/views/sign-in-view"
import { auth } from '@/lib/auth'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

const Page=async()=> {
  const session=await auth.api.getSession({
      headers:await headers()
    })
  
    if(!!session){
      redirect("/")
    }
  return (
    <>
      <style>{`
        .fixed.top-4.right-4.z-50 { display: none !important; }
      `}</style>
      <SignInView/>
    </>
  )
}

export default Page