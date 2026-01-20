import { plaidClient } from '@/lib/plaid';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { access_tokens, account_id, startDate: queryStartDate, endDate: queryEndDate, include_earliest_date } = await request.json();

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
    // We always fetch up to the current date (new Date()) to ensure we have recent transactions
    // needed to accurately calculate historical balances backwards from the current balance.
    const requestedEndDate = queryEndDate ? new Date(queryEndDate) : new Date();
    const fetchEndDate = new Date();
    
    const startDate = queryStartDate ? new Date(queryStartDate) : new Date();
    
    if (!queryStartDate) {
      startDate.setDate(requestedEndDate.getDate() - 30);
    }

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Find earliest transaction date if requested
    let earliest_transaction_date = null;
    if (include_earliest_date) {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      
      const countResponse = await plaidClient.transactionsGet({
        access_token: foundToken,
        start_date: formatDate(tenYearsAgo),
        end_date: formatDate(fetchEndDate),
        options: {
          account_ids: [account_id],
          count: 1,
          offset: 0
        },
      });
      
      const totalTx = countResponse.data.total_transactions;
      if (totalTx > 0) {
        // Fetch the very last (oldest) transaction
        // offset cannot be > 10000 generally, but Plaid max transactions history is typically limited anyway.
        // If > 5000, maybe take 5000? But we want the TRUE oldest.
        // Let's rely on Plaid pagination.
        const offset = Math.max(0, totalTx - 1);
        
        // Safety check if offset is too huge? 
        // We'll try. If it fails, we catch error and ignore earliest_date.
        try {
          const oldestResponse = await plaidClient.transactionsGet({
            access_token: foundToken,
            start_date: formatDate(tenYearsAgo),
            end_date: formatDate(fetchEndDate),
            options: {
               account_ids: [account_id],
               count: 1,
               offset: offset
            }
          });
          
          if (oldestResponse.data.transactions.length > 0) {
            earliest_transaction_date = oldestResponse.data.transactions[0].date;
          }
        } catch (err) {
           console.warn('Failed to fetch oldest transaction', err);
        }
      }
    }

    // Get transactions
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: foundToken,
      start_date: formatDate(startDate),
      end_date: formatDate(fetchEndDate),
      options: {
        account_ids: [account_id],
        count: 500, // Increase limit to capture more history
      },
    });

    return NextResponse.json({
      account: accountInfo,
      transactions: transactionsResponse.data.transactions,
      total_transactions: transactionsResponse.data.total_transactions,
      earliest_transaction_date,
    });

  } catch (error: any) {
    console.error('Error fetching account details:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
