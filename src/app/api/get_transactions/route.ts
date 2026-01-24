import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';
import { RemovedTransaction, Transaction } from 'plaid';

export async function POST(request: Request) {
  try {
    const { access_token, account_ids, startDate, endDate } = await request.json();

    if (!access_token || !account_ids || !Array.isArray(account_ids)) {
      return NextResponse.json({ error: 'Missing access_token or account_ids' }, { status: 400 });
    }

    let allTransactions: Transaction[] = [];
    let hasMore = true;
    let cursor = null;
    let offset = 0;

    // We can use the 'count' and 'offset' pagination
    // Plaid max count is 500
    const count = 500;

    while (hasMore) {
      try {
        const response = await plaidClient.transactionsGet({
          access_token: access_token,
          start_date: startDate,
          end_date: endDate,
          options: {
            account_ids: account_ids,
            count: count,
            offset: offset,
          },
        });

        const transactions = response.data.transactions;
        allTransactions = allTransactions.concat(transactions);

        if (transactions.length < count) {
          hasMore = false;
        } else {
            offset += count;
        }
        
        // Safety break to prevent infinite loops if something goes wrong
        if (offset > 10000) { 
            hasMore = false; 
        }

      } catch (error) {
        console.error('Error fetching transactions page:', error);
        // Break on error, return what we have? Or fail?
        // If the first request fails, we should probably throw
        if (offset === 0) throw error;
        hasMore = false;
      }
    }

    return NextResponse.json({ transactions: allTransactions });
  } catch (error: any) {
    console.error('Error in get_transactions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
