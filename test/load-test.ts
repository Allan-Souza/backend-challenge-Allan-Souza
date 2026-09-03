import autocannon from 'autocannon';
import { v4 as uuidv4 } from 'uuid';

async function run() {
  console.log('Starting load test...');
  
  // First, we create a wallet to ensure it exists
  const playerId = uuidv4();
  const walletRes = await fetch('http://localhost:3000/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId,
      initialBalanceAmount: '1000000.00',
      currency: 'BRL'
    })
  });

  if (!walletRes.ok) {
    console.error('Failed to create wallet for load test', await walletRes.text());
    return;
  }
  const wallet = await walletRes.json();
  console.log(`Wallet created: ${wallet.walletId}`);

  const instance = autocannon({
    url: 'http://localhost:3000',
    connections: 10, // default
    pipelining: 1, // default
    duration: 10, // 10 seconds
    requests: [
      {
        method: 'POST',
        path: '/transactions',
        headers: {
          'Content-Type': 'application/json',
        },
        setupRequest: (req: any) => {
          const id = uuidv4();
          req.headers['Idempotency-Key'] = `idem-${id}`;
          req.body = JSON.stringify({
            providerId: 'PROV-LOAD',
            externalTransactionId: `EXT-${id}`,
            playerId,
            currency: 'BRL',
            roundId: 'R-LOAD',
            gameId: 'G-LOAD',
            kind: 'BET',
            moneyAmount: '1.00',
          });
          return req;
        }
      }
    ]
  }, (err: Error | null, result: autocannon.Result) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(autocannon.printResult(result));
  });

  // Track progress
  autocannon.track(instance, { renderProgressBar: true });
}

run().catch(console.error);
