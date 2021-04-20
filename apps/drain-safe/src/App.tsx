import React, { useCallback, useState, useEffect } from 'react';
import { Button, Loader, Title, TextField, Table, Text } from '@gnosis.pm/safe-react-components';
import { useSafeAppsSDK } from '@gnosis.pm/safe-apps-react-sdk';
import web3Utils from 'web3-utils';
import erc20 from './abis/erc20';
import { fetchJson, encodeTxData } from './utils';
import Container from './Container';
import Icon from './Icon';
import Flex from './Flex';

interface Asset {
  balance: string;
  fiatBalance: string;
  fiatConversion: string;
  tokenInfo: {
    address: string;
    decimals: number;
    logoUri: string;
    name: string;
    symbol: string;
    type: string;
  };
}

interface Balance {
  fiatTotal: string;
  items: Asset[];
}

const CURRENCY = 'USD';

async function fetchSafeAssets(safeAddress: string, safeNetwork: string): Promise<Balance> {
  const network = safeNetwork.toLowerCase() === 'mainnet' ? 'mainnet' : 'rinkeby';
  const url = `https://safe-client.${network}.gnosis.io/v1/safes/${safeAddress}/balances/${CURRENCY}/?trusted=false&exclude_spam=true`;
  const data = await fetchJson(url);
  return data as Balance;
}

const App: React.FC = () => {
  const { sdk, safe } = useSafeAppsSDK();
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [toAddress, setToAddress] = useState<string>('');
  const [isFinished, setFinished] = useState<boolean>(false);

  const fetchBalances = useCallback(async (): Promise<void> => {
    // Fetch safe assets
    try {
      const data = await fetchSafeAssets(safe.safeAddress, safe.network);
      setAssets(data.items);
    } catch (err) {
      console.error("Couldn't load assets", err);
    }
  }, [safe]);

  const submitTx = useCallback(async () => {
    setSubmitting(true);
    setFinished(false);

    const txs = assets.map((item) => {
      return item.tokenInfo.type === 'ETHER'
        ? {
            // Send ETH directly to the recipient address
            to: web3Utils.toChecksumAddress(toAddress),
            value: item.balance,
            data: '0x',
          }
        : {
            // For other token types, generate a contract tx
            to: web3Utils.toChecksumAddress(item.tokenInfo.address),
            value: '0',
            data: encodeTxData(erc20.transfer, toAddress, item.balance),
          };
    });

    let safeTxHash = '';
    try {
      const data = await sdk.txs.send({ txs });
      safeTxHash = data.safeTxHash;
      console.log(safeTxHash);
    } catch (e) {
      console.error(e);
    }

    if (!safeTxHash) {
      setSubmitting(false);
      return;
    }

    const poll = setInterval(async (): Promise<void> => {
      try {
        const safeTx = await sdk.txs.getBySafeTxHash(safeTxHash);
        console.log(safeTx);
      } catch (e) {
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      setFinished(true);

      setAssets(
        assets.map((item) => ({
          ...item,
          balance: '0',
          fiatBalance: '0',
        })),
      );
    }, 1000);

    return () => {
      clearInterval(poll);
    };
  }, [sdk, assets, toAddress]);

  const onToAddressChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setToAddress(e.target.value);
  };

  // Fetch balances
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return (
    <Container>
      <Title size="md">Drain Account</Title>

      {isFinished && <Text size="lg">The transaction has been created. Refresh the app when it's executed.</Text>}

      <Table
        headers={[
          { id: 'col1', label: 'Asset' },
          { id: 'col2', label: 'Amount' },
          { id: 'col3', label: `Value, ${CURRENCY}` },
        ]}
        rows={assets.map((item: Asset, index: number) => ({
          id: `${index}`,
          cells: [
            {
              content: (
                <Flex>
                  <Icon src={item.tokenInfo.logoUri} alt="" />
                  {item.tokenInfo.name}
                </Flex>
              ),
            },
            { content: web3Utils.fromWei(item.balance) },
            { content: item.fiatBalance },
          ],
        }))}
      />

      {submitting ? (
        <>
          <Flex centered>
            <Loader size="md" />
          </Flex>
          <Flex centered>
            <Button
              size="lg"
              color="secondary"
              onClick={() => {
                setSubmitting(false);
              }}
            >
              Cancel
            </Button>
          </Flex>
        </>
      ) : (
        <>
          <TextField onChange={onToAddressChange} value={toAddress} label="Recipient" />

          <Flex centered>
            <Button
              size="lg"
              color="primary"
              variant="contained"
              onClick={submitTx}
              disabled={!assets.length || !web3Utils.isAddress(toAddress)}
            >
              Transfer everything
            </Button>
          </Flex>
        </>
      )}
    </Container>
  );
};

export default App;
