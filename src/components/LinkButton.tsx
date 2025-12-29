'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, PlaidLinkOptions } from 'react-plaid-link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface LinkButtonProps {
    onSuccess: (publicToken: string) => void;
}

export default function LinkButton({ onSuccess }: LinkButtonProps) {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const createLinkToken = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/create_link_token', { method: 'POST' });
                const data = await response.json();
                setToken(data.link_token);
            } catch (error) {
                console.error('Error creating link token:', error);
            } finally {
                setLoading(false);
            }
        };

        createLinkToken();
    }, []);

    const handleOnSuccess = useCallback(
        (public_token: string) => {
            onSuccess(public_token);
        },
        [onSuccess]
    );

    const config: PlaidLinkOptions = {
        token: token!,
        onSuccess: handleOnSuccess,
    };

    const { open, ready } = usePlaidLink(config);

    return (
        <Button
            onClick={() => open()}
            disabled={!ready || loading}
            className="bg-neutral-600 hover:bg-neutral-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 flex items-center gap-2"
        >
            {(loading || !ready) && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Initializing Plaid...' : 'Connect an Account'}
        </Button>
    );
}
