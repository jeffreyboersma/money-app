import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { public_token } = await request.json();

        const response = await plaidClient.itemPublicTokenExchange({
            public_token,
        });

        const accessToken = response.data.access_token;
        const itemID = response.data.item_id;

        // In a real app, you would save these to a database
        // For this starter, we'll return them (NOT SECURE FOR PRODUCTION)
        return NextResponse.json({
            access_token: accessToken,
            item_id: itemID,
        });
    } catch (error: any) {
        console.error('Error exchanging token:', error.response?.data || error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
