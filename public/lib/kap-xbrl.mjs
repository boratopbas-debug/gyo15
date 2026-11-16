// XBRL kalem eşlemesi (tarayıcı ve sunucu ortak).
/** Motorun kullandığı XBRL kalemleri — her biri için alternatif adlar sırayla denenir. */
export const XBRL = {
  CA: ['ifrs-full_CurrentAssets'],
  CL: ['ifrs-full_CurrentLiabilities'],
  TA: ['ifrs-full_Assets'],
  TL: ['ifrs-full_Liabilities'],
  EQ: ['ifrs-full_EquityAttributableToOwnersOfParent', 'ifrs-full_Equity'],
  CASH: ['ifrs-full_CashAndCashEquivalents'],
  CFI: ['kap-fr_CurrentFinancialInvestments'],
  STB: ['kap-fr_CurrentBorowings', 'kap-fr_CurrentBorrowings'],
  CPLTB: ['kap-fr_CurrentPortionOfNoncurrentBorrowings'],
  LTB: ['ifrs-full_LongtermBorrowings'],
  OFL_C: ['kap-fr_OtherCurrentFinancialLiabilities'],
  OFL_N: ['kap-fr_OtherNoncurrentFinancialLiabilities'],
  REV: ['ifrs-full_Revenue'],
  GP: ['ifrs-full_GrossProfit'],
  GA: ['ifrs-full_AdministrativeExpense'],
  MKT: ['kap-fr_MarketingExpense', 'ifrs-full_SellingExpense'],
  RD: ['ifrs-full_ResearchAndDevelopmentExpense'],
  DA: ['ifrs-full_AdjustmentsForDepreciationAndAmortisationExpense', 'ifrs-full_DepreciationAndAmortisationExpense'],
};

