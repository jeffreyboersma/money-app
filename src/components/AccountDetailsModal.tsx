'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Transaction {
  transaction_id: string;
  date: string;
  name: string;
  amount: number;
  category: string[];
}

interface AccountData {
  account: {
    account_id: string;
    name: string;
    official_name: string | null;
    type: string;
    subtype: string;
    balances: {
      current: number;
      available: number | null;
      limit: number | null;
      iso_currency_code: string;
    };
  };
  transactions: Transaction[];
}

interface BalanceHistoryPoint {
  date: string;
  balance: number;
}

interface AccountDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  accessTokens: string[];
}

export default function AccountDetailsModal({ isOpen, onClose, accountId, accessTokens }: AccountDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountData | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryPoint[]>([]);

  // Reset state when modal opens/closes or account changes
  useEffect(() => {
    if (isOpen && accountId) {
      setLoading(true);
      setError(null);
      setData(null);
      fetchData();
    }
  }, [isOpen, accountId]);

  async function fetchData() {
    if (!accountId) return;
    
    try {
      if (!accessTokens || accessTokens.length === 0) {
        throw new Error('No access tokens available.');
      }

      const response = await fetch('/api/get_account_details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_tokens: accessTokens,
          account_id: accountId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch account details');
      }

      const result = await response.json();
      setData(result);
      calculateBalanceHistory(result.account.balances.current, result.transactions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const calculateBalanceHistory = (currentBalance: number, transactions: Transaction[]) => {
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const txMap: Record<string, number> = {};
    sortedTransactions.forEach(tx => {
        txMap[tx.date] = (txMap[tx.date] || 0) + tx.amount;
    });

    let tempBalance = currentBalance;
    const historyPoints: BalanceHistoryPoint[] = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        historyPoints.unshift({
            date: dateStr,
            balance: tempBalance
        });

        const change = txMap[dateStr] || 0;
        tempBalance += change;
    }

    setBalanceHistory(historyPoints);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-background rounded-lg shadow-xl border">
        
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-background/95 backdrop-blursupports-[backdrop-filter]:bg-background/60">
            <div>
                 {data ? (
                    <>
                        <h2 className="text-xl font-bold">{data.account.name}</h2>
                        <p className="text-sm text-muted-foreground">{data.account.official_name || data.account.subtype}</p>
                    </>
                 ) : (
                    <h2 className="text-xl font-bold">Account Details</h2>
                 )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
            </Button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
               Loading details...
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-4">
              <p>{error}</p>
              <Button variant="outline" onClick={fetchData}>Retry</Button>
            </div>
          )}

          {!loading && !error && data && (
            <>
                <div className="text-3xl font-bold text-primary">
                    {formatCurrency(data.account.balances.current, data.account.balances.iso_currency_code)}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Balance History (Last 30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={balanceHistory}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis 
                                        dataKey="date" 
                                        tickFormatter={(str) => {
                                            const date = new Date(str);
                                            return `${date.getMonth() + 1}/${date.getDate()}`;
                                        }}
                                        minTickGap={30}
                                    />
                                    <YAxis 
                                        domain={['auto', 'auto']}
                                        tickFormatter={(val) => `$${val}`}
                                    />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                        formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(2)}`, 'Balance'] : ['N/A', 'Balance']}
                                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="balance" 
                                        stroke="#2563eb" 
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recent Transactions</CardTitle>
                        <CardDescription>Transactions from the last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-muted-foreground border-b">
                                    <tr>
                                        <th className="py-3 font-medium">Date</th>
                                        <th className="py-3 font-medium">Description</th>
                                        <th className="py-3 font-medium">Category</th>
                                        <th className="py-3 font-medium text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.transactions.map((tx) => (
                                        <tr key={tx.transaction_id} className="hover:bg-muted/50">
                                            <td className="py-3">{tx.date}</td>
                                            <td className="py-3 font-medium">{tx.name}</td>
                                            <td className="py-3 text-muted-foreground">
                                                {tx.category ? tx.category[0] : 'Uncategorized'}
                                            </td>
                                            <td className={`py-3 text-right font-medium ${tx.amount > 0 ? '' : 'text-green-600'}`}>
                                                {formatCurrency(tx.amount, data.account.balances.iso_currency_code)}
                                            </td>
                                        </tr>
                                    ))}
                                    {data.transactions.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-muted-foreground">
                                                No transactions found in the last 30 days.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
