import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { access_token } = await request.json();

        if (!access_token) {
            return NextResponse.json({ error: 'Missing access_token' }, { status: 400 });
        }

        const response = await plaidClient.itemRemove({
            access_token,
        });

        return NextResponse.json({ success: true, request_id: response.data.request_id });
    } catch (error: any) {
        console.error('Error removing item:', error.response?.data || error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
