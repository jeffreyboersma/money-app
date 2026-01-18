import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { access_tokens, account_id, startDate: queryStartDate, endDate: queryEndDate } = await request.json();

    if (!access_tokens || !Array.isArray(access_tokens) || !account_id) {
      return NextResponse.json({ error: 'Missing access_tokens or account_id' }, { status: 400 });
    }

    let foundToken = null;
    let accountInfo = null;

    // Find the token that owns this account
    for (const token of access_tokens) {
      try {
        const accountsResponse = await plaidClient.accountsGet({
          access_token: token,
          options: {
            account_ids: [account_id],
          },
        });

        if (accountsResponse.data.accounts.length > 0) {
          foundToken = token;
          accountInfo = accountsResponse.data.accounts[0];
          break;
        }
      } catch (e) {
        // Ignore errors for tokens that don't own the account
        continue;
      }
    }

    if (!foundToken || !accountInfo) {
      return NextResponse.json({ error: 'Account not found in provided access tokens' }, { status: 404 });
    }

    // Fetch transactions based on date range or default to 30 days
    const endDate = queryEndDate ? new Date(queryEndDate) : new Date();
    const startDate = queryStartDate ? new Date(queryStartDate) : new Date();
    
    if (!queryStartDate) {
      startDate.setDate(endDate.getDate() - 30);
    }

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Get transactions
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: foundToken,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      options: {
        account_ids: [account_id],
      },
    });

    return NextResponse.json({
      account: accountInfo,
      transactions: transactionsResponse.data.transactions,
    });

  } catch (error: any) {
    console.error('Error fetching account details:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
