import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { access_token } = await request.json();

        const response = await plaidClient.accountsBalanceGet({
            access_token,
        });

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('Error fetching balances:', error.response?.data || error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
