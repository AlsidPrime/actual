import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import api from '@actual-app/api';

const outputDirectory = resolve('data/cash-flow-qa');

function parseAnchor(args) {
  if (args.length === 0) {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  if (args.length !== 2 || args[0] !== '--anchor') {
    throw new Error('Usage: yarn cash-flow:generate-qa [--anchor YYYY-MM-DD]');
  }
  const anchor = args[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    throw new Error('Anchor must be a date in YYYY-MM-DD format');
  }
  const date = new Date(`${anchor}T12:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== anchor
  ) {
    throw new Error(`Invalid anchor date: ${anchor}`);
  }
  return anchor;
}

function addDays(anchor, days) {
  const date = new Date(`${anchor}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(anchor, months) {
  const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function recurringSchedule(date, frequency, interval) {
  return {
    frequency,
    interval,
    start: date,
    patterns: [],
    skipWeekend: false,
    weekendSolveMode: 'after',
    endMode: 'never',
  };
}

async function createDataset(anchor) {
  const accounts = {};
  const categories = {};
  const payees = {};

  await api.runImport(`Cash Flow Calendar QA (${anchor})`, async () => {
    for (const name of [
      'Operating Checking',
      'Secondary Operating',
      'Sinking Savings',
      'Long-Term Savings',
    ]) {
      accounts[name] = await api.createAccount({ name }, 0);
    }

    for (const [groupName, categoryNames] of [
      [
        'Everyday spending',
        ['Groceries', 'Fuel', 'Recreation / Miscellaneous'],
      ],
      [
        'Sinking funds',
        [
          'Clothing sinking fund',
          'Vehicle Maintenance sinking fund',
          'Christmas / annual sinking fund',
        ],
      ],
      ['Fixed bills', ['Rent', 'Utilities', 'Insurance']],
    ]) {
      const groupId = await api.createCategoryGroup({ name: groupName });
      for (const name of categoryNames) {
        categories[name] = await api.createCategory({
          name,
          group_id: groupId,
          is_income: false,
          hidden: false,
        });
      }
    }

    for (const name of [
      'QA Employer One',
      'QA Employer Two',
      'QA Grocery Store',
      'QA Fuel Station',
      'QA Recreation',
      'QA Landlord',
      'QA Utility Company',
      'QA Insurance Company',
      'QA Clothing Store',
      'QA Savings Interest',
      'QA Manual Bill',
    ]) {
      payees[name] = await api.createPayee({ name, transfer_acct: null });
    }

    const transaction = (days, amount, payee, category) => ({
      date: addDays(anchor, days),
      amount,
      payee: payees[payee],
      category: categories[category],
    });
    await api.addTransactions(accounts['Operating Checking'], [
      {
        date: addDays(anchor, -20),
        amount: 200000,
        notes: 'Synthetic opening balance',
      },
      transaction(-8, -23000, 'QA Grocery Store', 'Groceries'),
      transaction(-5, -9000, 'QA Fuel Station', 'Fuel'),
      transaction(-2, -8000, 'QA Recreation', 'Recreation / Miscellaneous'),
      transaction(-1, -8000, 'QA Grocery Store', 'Groceries'),
    ]);
    await api.addTransactions(accounts['Secondary Operating'], [
      {
        date: addDays(anchor, -20),
        amount: 25000,
        notes: 'Synthetic opening balance',
      },
    ]);
    await api.addTransactions(accounts['Sinking Savings'], [
      {
        date: addDays(anchor, -20),
        amount: 900000,
        notes: 'Synthetic opening balance',
      },
      transaction(-3, -15000, 'QA Clothing Store', 'Clothing sinking fund'),
    ]);
    await api.addTransactions(accounts['Long-Term Savings'], [
      {
        date: addDays(anchor, -20),
        amount: 1800000,
        notes: 'Synthetic opening balance',
      },
    ]);

    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const month = addMonths(anchor, monthOffset);
      for (const [name, amount] of [
        ['Groceries', 45000],
        ['Fuel', 18000],
        ['Recreation / Miscellaneous', 12000],
        ['Clothing sinking fund', 7500],
        ['Vehicle Maintenance sinking fund', 10000],
        ['Christmas / annual sinking fund', 15000],
        ['Rent', 190000],
        ['Utilities', 20000],
        ['Insurance', 12000],
      ]) {
        await api.setBudgetAmount(month, categories[name], amount);
      }
    }

    const transferPayees = new Map(
      (await api.getPayees())
        .filter(payee => payee.transfer_acct)
        .map(payee => [payee.transfer_acct, payee.id]),
    );
    function transferPayee(accountName) {
      const id = transferPayees.get(accounts[accountName]);
      if (!id) throw new Error(`No native transfer payee for ${accountName}`);
      return id;
    }

    const schedule = (
      name,
      days,
      amount,
      accountName,
      payee,
      posts_transaction,
      recurrence = null,
    ) =>
      api.createSchedule({
        name,
        posts_transaction,
        account: accounts[accountName],
        payee,
        amount,
        amountOp: 'is',
        date: recurrence
          ? recurringSchedule(addDays(anchor, days), ...recurrence)
          : addDays(anchor, days),
      });

    await schedule(
      'QA Rent — automatic',
      3,
      -190000,
      'Operating Checking',
      payees['QA Landlord'],
      true,
      ['monthly', 1],
    );
    await schedule(
      'QA Utilities — automatic',
      6,
      -20000,
      'Operating Checking',
      payees['QA Utility Company'],
      true,
      ['monthly', 1],
    );
    await schedule(
      'QA Insurance — automatic',
      8,
      -12000,
      'Operating Checking',
      payees['QA Insurance Company'],
      true,
      ['monthly', 1],
    );
    await schedule(
      'QA Employer One payday',
      10,
      220000,
      'Operating Checking',
      payees['QA Employer One'],
      true,
      ['weekly', 2],
    );
    await schedule(
      'QA Employer Two payday',
      10,
      150000,
      'Secondary Operating',
      payees['QA Employer Two'],
      true,
      ['weekly', 2],
    );
    await schedule(
      'QA Operating to Operating transfer',
      1,
      -10000,
      'Operating Checking',
      transferPayee('Secondary Operating'),
      true,
    );
    await schedule(
      'QA Operating to Sinking transfer',
      2,
      -15000,
      'Operating Checking',
      transferPayee('Sinking Savings'),
      true,
    );
    await schedule(
      'QA Sinking reimbursement to Operating',
      7,
      -12000,
      'Sinking Savings',
      transferPayee('Operating Checking'),
      true,
    );
    await schedule(
      'QA Sinking-only interest',
      5,
      2000,
      'Sinking Savings',
      payees['QA Savings Interest'],
      true,
    );
    await schedule(
      'QA Manual missed bill',
      -2,
      -7500,
      'Operating Checking',
      payees['QA Manual Bill'],
      false,
    );
    await schedule(
      'QA Manual due bill',
      0,
      -6000,
      'Operating Checking',
      payees['QA Manual Bill'],
      false,
    );
    await schedule(
      'QA Manual upcoming bill',
      7,
      -9000,
      'Operating Checking',
      payees['QA Manual Bill'],
      false,
    );
    await schedule(
      'QA Manual income',
      9,
      50000,
      'Operating Checking',
      payees['QA Employer One'],
      false,
    );
  });

  const outputPath = join(outputDirectory, `cash-flow-qa-${anchor}.zip`);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, await api.exportBudget());
  return outputPath;
}

let dataDirectory;
try {
  const anchor = parseAnchor(process.argv.slice(2));
  dataDirectory = await mkdtemp(join(tmpdir(), 'actual-cash-flow-qa-'));
  await api.init({ dataDir: dataDirectory });
  const outputPath = await createDataset(anchor);
  console.log(`Cash Flow QA budget: ${outputPath}`);
  console.log(`Anchor date: ${anchor}`);
  console.log(
    'Select Operating Checking and Secondary Operating as Operating, and Sinking Savings as Sinking after import.',
  );
} finally {
  await api.shutdown();
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
}
