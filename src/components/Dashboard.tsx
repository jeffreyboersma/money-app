'use client';

import React, { useState, useEffect } from 'react';
import LinkButton from './LinkButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Wallet, RefreshCw, AlertCircle, Trash2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AccountCard = ({ account }: { account: any }) => (
    <Card className="bg-neutral-900 border-neutral-800 shadow-md hover:border-neutral-700 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
                <CardTitle className="text-sm font-medium text-white">{account.name}</CardTitle>
                <p className="text-xs text-neutral-500 uppercase">{account.subtype}</p>
            </div>
            {account.institution_logo ? (
                <div className="w-8 h-8 flex items-center justify-center">
                    <img
                        src={`data:image/png;base64,${account.institution_logo}`}
                        alt={account.institution_name}
                        className="max-w-full max-h-full object-contain"
                    />
                </div>
            ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-neutral-400" />
                </div>
            )}
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold text-white">
                ${account.balances.current?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-neutral-500">
                    Ending in {account.mask}
                </p>
                {account.balances.available !== null && (
                    <p className="text-[10px] text-neutral-600">
                        Avail: ${account.balances.available.toLocaleString()}
                    </p>
                )}
            </div>
        </CardContent>
    </Card>
);

export default function Dashboard() {
    const [accessTokens, setAccessTokens] = useState<string[]>([]);
    const [allAccounts, setAllAccounts] = useState<any[]>([]);
    const [institutions, setInstitutions] = useState<Record<string, { name: string; logo?: string }>>({});
    const [loading, setLoading] = useState(false);
    const [removingToken, setRemovingToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'institution' | 'type'>('institution');

    // Load tokens from localStorage on mount
    useEffect(() => {
        const savedTokens = localStorage.getItem('plaid_access_tokens');
        if (savedTokens) {
            const tokens = JSON.parse(savedTokens);
            setAccessTokens(tokens);
        }
    }, []);

    // Save tokens and fetch balances when they change
    useEffect(() => {
        if (accessTokens.length > 0) {
            localStorage.setItem('plaid_access_tokens', JSON.stringify(accessTokens));
            fetchAllBalances(accessTokens);
        }
    }, [accessTokens]);

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

            const newToken = result.access_token;
            setAccessTokens(prev => {
                if (prev.includes(newToken)) return prev;
                return [...prev, newToken];
            });
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const fetchAllBalances = async (tokens: string[]) => {
        setLoading(true);
        setError(null);
        try {
            const fetchPromises = tokens.map(token =>
                fetch('/api/get_balances', {
                    method: 'POST',
                    body: JSON.stringify({ access_token: token }),
                    headers: { 'Content-Type': 'application/json' },
                }).then(async res => {
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    // Add institution info to each account
                    if (data.institution) {
                        setInstitutions(prev => ({
                            ...prev,
                            [token]: {
                                name: data.institution.name,
                                logo: data.institution.logo,
                            }
                        }));
                    }
                    return data.accounts.map((account: any) => ({
                        ...account,
                        access_token: token, // Add token to account for filtering later
                        institution_name: data.institution?.name,
                        institution_logo: data.institution?.logo,
                    }));
                })
            );

            const results = await Promise.all(fetchPromises);
            const combinedAccounts = results.flat();
            setAllAccounts(combinedAccounts);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveInstitution = async (token: string) => {
        if (!confirm('Are you sure you want to remove this institution? All associated accounts will be disconnected.')) return;

        setRemovingToken(token);
        setError(null);
        try {
            const response = await fetch('/api/remove_institution', {
                method: 'POST',
                body: JSON.stringify({ access_token: token }),
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);

            const newTokens = accessTokens.filter(t => t !== token);
            setAccessTokens(newTokens);
            localStorage.setItem('plaid_access_tokens', JSON.stringify(newTokens));

            setAllAccounts(prev => prev.filter(acc => acc.access_token !== token));

            setInstitutions(prev => {
                const next = { ...prev };
                delete next[token];
                return next;
            });

        } catch (err: any) {
            setError(`Failed to remove institution: ${err.message}`);
        } finally {
            setRemovingToken(null);
        }
    };

    const totalBalance = allAccounts.reduce((acc, curr) => acc + (curr.balances.current || 0), 0);

    const sortedAccounts = [...allAccounts].sort((a, b) => {
        if (sortBy === 'institution') {
            const nameA = a.institution_name || '';
            const nameB = b.institution_name || '';
            if (nameA !== nameB) return nameA.localeCompare(nameB);

            // Secondary sort by balance (DESC)
            const balA = a.balances.current || 0;
            const balB = b.balances.current || 0;
            if (balA !== balB) return balB - balA;

            return a.name.localeCompare(b.name);
        }
        if (sortBy === 'type') {
            const typeA = a.subtype || '';
            const typeB = b.subtype || '';
            if (typeA !== typeB) return typeA.localeCompare(typeB);

            // Secondary sort by balance (DESC)
            const balA = a.balances.current || 0;
            const balB = b.balances.current || 0;
            if (balA !== balB) return balB - balA;

            const instA = a.institution_name || '';
            const instB = b.institution_name || '';
            if (instA !== instB) return instA.localeCompare(instB);

            return a.name.localeCompare(b.name);
        }
        return 0;
    });

    const groupedAccounts = sortedAccounts.reduce((acc: Record<string, any[]>, account) => {
        const key = sortBy === 'institution'
            ? (account.institution_name || 'Other Institutions')
            : (account.subtype ? account.subtype.charAt(0).toUpperCase() + account.subtype.slice(1) : 'Other');

        if (!acc[key]) acc[key] = [];
        acc[key].push(account);
        return acc;
    }, {});

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-thin tracking-wider text-white">Dashboard</h2>
                    <p className="font-thin tracking-wider text-neutral-400">Manage your finances across multiple institutions.</p>
                </div>
                <div className="flex gap-3">
                    <LinkButton onSuccess={handleLinkSuccess} />
                    {accessTokens.length > 0 && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => fetchAllBalances(accessTokens)}
                            disabled={loading}
                            className="border-none bg-neutral-700 text-white hover:bg-neutral-800 hover:text-white"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <p>{error}</p>
                </div>
            )}

            {accessTokens.length === 0 && !loading && (
                <Card className="max-w-md mx-auto bg-neutral-900 border-neutral-800 shadow-xl">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                            <Wallet className="h-6 w-6 text-neutral-400" />
                        </div>
                        <CardTitle className="text-2xl text-white">Connect your first bank</CardTitle>
                        <CardDescription className="text-neutral-400">
                            Link your financial accounts to see all your balances and transactions in one place.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center pb-8">
                        <LinkButton onSuccess={handleLinkSuccess} />
                    </CardContent>
                </Card>
            )}

            {allAccounts.length > 0 && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="bg-neutral-900 border-neutral-800 shadow-lg">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-neutral-400">Total Net Worth</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">
                                    ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-neutral-900 border-neutral-800 shadow-lg">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-neutral-400">Linked Institutions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{accessTokens.length}</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-neutral-900 border-neutral-800 shadow-lg">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-neutral-400">Active Accounts</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{allAccounts.length}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Linked Institutions</h3>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(institutions).map(([token, info]) => (
                                <Card key={token} className="bg-neutral-900 border-neutral-800 shadow-md">
                                    <div className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {info.logo ? (
                                                <div className="w-10 h-10 flex items-center justify-center">
                                                    <img
                                                        src={`data:image/png;base64,${info.logo}`}
                                                        alt={info.name}
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                                                    <Building2 className="h-4 w-4 text-neutral-400" />
                                                </div>
                                            )}
                                            <span className="font-medium text-white">{info.name}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveInstitution(token)}
                                            disabled={removingToken === token}
                                            className="text-neutral-500 hover:text-red-400 hover:bg-red-400/10"
                                        >
                                            {removingToken === token ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h3 className="text-lg font-semibold text-white">Accounts</h3>
                            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
                                <span className="text-xs text-neutral-500 px-2 font-medium uppercase tracking-wider">Sort by:</span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSortBy('institution')}
                                        className={`h-7 px-3 text-xs rounded-md transition-all ${sortBy === 'institution'
                                            ? 'bg-neutral-800 text-white shadow-sm'
                                            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
                                            }`}
                                    >
                                        Institution
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSortBy('type')}
                                        className={`h-7 px-3 text-xs rounded-md transition-all ${sortBy === 'type'
                                            ? 'bg-neutral-800 text-white shadow-sm'
                                            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
                                            }`}
                                    >
                                        Type
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            {Object.entries(groupedAccounts).map(([groupName, accounts]) => (
                                <div key={groupName} className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{groupName}</h4>
                                        <div className="h-[1px] flex-1 bg-neutral-800"></div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {accounts.map((account: any, idx) => (
                                            <AccountCard key={`${account.account_id}-${idx}`} account={account} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {loading && allAccounts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-neutral-600" />
                    <p className="text-neutral-500 animate-pulse">Fetching account data...</p>
                </div>
            )}
        </div>
    );
}
