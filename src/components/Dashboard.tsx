'use client';

import React, { useState } from 'react';
import LinkButton from './LinkButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Wallet, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLinkSuccess = async (publicToken: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/exchange_public_token', {
                method: 'POST',
                body: JSON.stringify({ public_token: publicToken }),
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);

            setAccessToken(result.access_token);
            fetchBalances(result.access_token);
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const fetchBalances = async (token: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/get_balances', {
                method: 'POST',
                body: JSON.stringify({ access_token: token }),
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            setData(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            {!accessToken ? (
                <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle className="text-2xl">Connect your bank</CardTitle>
                        <CardDescription>
                            Link your financial accounts to see all your balances in one place.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <LinkButton onSuccess={handleLinkSuccess} />
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-3xl font-bold tracking-tight">Your Accounts</h2>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchBalances(accessToken)}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>

                    {error && (
                        <div className="bg-destructive/15 text-destructive p-4 rounded-lg flex items-center gap-3">
                            <AlertCircle className="h-5 w-5" />
                            <p>{error}</p>
                        </div>
                    )}

                    {data && (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {data.accounts.map((account: any) => (
                                <Card key={account.account_id} className="overflow-hidden">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">
                                            {account.name}
                                        </CardTitle>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            ${account.balances.current.toLocaleString()}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {account.subtype} • {account.mask}
                                        </p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {loading && !data && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
