import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
    apiVersion: "2026-01-28.clover",
    typescript: true,
});

export async function POST() {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            console.error("[CHECKOUT_ERROR] STRIPE_SECRET_KEY is missing. Did you restart the server after updating .env?");
            return new NextResponse("Server Configuration Error: Missing Stripe Key", { status: 500 });
        }

        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session || !session.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const checkoutSession = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: "Apex-Agents Pro Plan",
                            description: "Unlimited agents, meetings, and advanced analytics.",
                        },
                        unit_amount: 1900, // $19.00
                        recurring: {
                            interval: "month",
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                userId: session.user.id,
            },
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/upgrade?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/upgrade?canceled=true`,
        });

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("[STRIPE_ERROR]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
