import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';
import { CountryCode } from 'plaid';

export async function POST(request: Request) {
    try {
        const { access_token } = await request.json();

        const balanceResponse = await plaidClient.accountsBalanceGet({
            access_token,
        });

        const institutionId = balanceResponse.data.item.institution_id;
        let institution = null;

        if (institutionId) {
            try {
                const institutionResponse = await plaidClient.institutionsGetById({
                    institution_id: institutionId,
                    country_codes: [CountryCode.Us],
                    options: {
                        include_optional_metadata: true,
                    },
                });
                institution = institutionResponse.data.institution;
            } catch (instError) {
                console.error('Error fetching institution:', instError);
            }
        }

        return NextResponse.json({
            accounts: balanceResponse.data.accounts,
            institution,
        });
    } catch (error: any) {
        console.error('Error fetching balances:', error.response?.data || error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
