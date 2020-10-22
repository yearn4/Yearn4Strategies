require("dotenv").config();
const Web3 = require("web3");

const { mainnet: addresses } = require("./addresses");

const YearnCompDaiStrategy = require("./build/contracts/YearnCompDaiStrategy.json");

const IERC20 = require("./build/contracts/IERC20.json");
const CIERC20 = require("./build/contracts/cErc20I.json");

const ComptrollerI = require("./build/contracts/ComptrollerI.json");

const web3 = new Web3(new Web3("http://127.0.0.1:8545"));

const unlockAddress = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

const DAI = new web3.eth.Contract(IERC20.abi, addresses.tokens.dai);

const cDAI = new web3.eth.Contract(CIERC20.abi, addresses.tokens.cDai);

const COMP = new web3.eth.Contract(IERC20.abi, addresses.tokens.comp);

const Icompt = new web3.eth.Contract(
  ComptrollerI.abi,
  addresses.comptroller.Icomptroller
);

const AMOUNT_DEPOSIT_WEI = web3.utils.toWei((2000000).toString()); // 2M

const test = async () => {
  try {
    const networkId = await web3.eth.net.getId();
    const blockNumber = await web3.eth.getBlockNumber();

    const StrategyContract = new web3.eth.Contract(
      YearnCompDaiStrategy.abi,
      YearnCompDaiStrategy.networks[networkId].address
    );

    const AMOUNT_BAL_WHALE = await DAI.methods.balanceOf(unlockAddress).call();

    /* For testing purpose to check properly the max liq in aave at current block
    let max_liq = await StrategyContract.methods
      ._maxLiqAaveAvailable(AMOUNT_BAL_WHALE)
      .call();
    console.log("Max liq available in aave in block number: " + blockNumber);
    console.log(web3.utils.fromWei(max_liq.toString()));*/

    // -- Send Whale DAI balance to the contract for testing deposit() method --

    for (let i = 0; i < 8; i++) {
      await DAI.methods
        .transfer(StrategyContract.options.address, AMOUNT_DEPOSIT_WEI)
        .send({ from: unlockAddress });

      let tx = await StrategyContract.methods.deposit();

      const [gasPrice, gasCost] = await Promise.all([
        web3.eth.getGasPrice(),
        tx.estimateGas({ from: unlockAddress }),
      ]);

      let data = tx.encodeABI();

      const txData = {
        from: unlockAddress,
        to: StrategyContract.options.address,
        data,
        gas: gasCost,
        gasPrice,
      };

      const receipt = await web3.eth.sendTransaction(txData);

      console.log(`Transaction hash: ${receipt.transactionHash}`);
    }

    const AFTER_DEPOSIT = {
      account_borrowable: await Icompt.methods
        .getAccountLiquidity(StrategyContract.options.address)
        .call(),
      comp_bal: await COMP.methods
        .balanceOf(StrategyContract.options.address)
        .call(),
      dai_contract_bal: await DAI.methods
        .balanceOf(StrategyContract.options.address)
        .call(),
      cdai_contract_bal: await cDAI.methods
        .balanceOf(StrategyContract.options.address)
        .call(),
      current_pos: await StrategyContract.methods.getCurrentPosition().call(),
    };

    console.log("--- Current position after depositing 2M x 8 ---");
    console.log(
      "Deposited: " +
        web3.utils.fromWei(AFTER_DEPOSIT.current_pos.deposits.toString())
    );
    console.log(
      "Borrowed: " +
        web3.utils.fromWei(AFTER_DEPOSIT.current_pos.borrows.toString())
    );

    // -- Test withdrawAll() --
    console.log("--- NEXT STEP ---> withdrawaAll() ---");

    tx = await StrategyContract.methods.withdrawAll();

    data = tx.encodeABI();

    const txData_claim = {
      from: unlockAddress,
      to: StrategyContract.options.address,
      data,
      gas: 4100000,
      gasPrice: await web3.eth.getGasPrice(),
    };

    const receipt_claim = await web3.eth.sendTransaction(txData_claim);

    console.log(`Transaction hash: ${receipt_claim.transactionHash}`);

    const AFTER_DEPOSIT_AND_CLAIM = {
      comp_bal: await COMP.methods
        .balanceOf(StrategyContract.options.address)
        .call(), // It gets updated properly via _claimComp() internal
      dai_contract_bal: await DAI.methods
        .balanceOf(StrategyContract.options.address)
        .call(),
      cdai_contract_bal: await cDAI.methods
        .balanceOf(StrategyContract.options.address)
        .call(),
      current_pos: await StrategyContract.methods.getCurrentPosition().call(),
    };

    console.log("--- Current position after withdraAll() ---");
    console.log(
      "Deposited: " +
        web3.utils.fromWei(
          AFTER_DEPOSIT_AND_CLAIM.current_pos.deposits.toString()
        )
    );
    console.log(
      "Borrowed: " +
        web3.utils.fromWei(
          AFTER_DEPOSIT_AND_CLAIM.current_pos.borrows.toString()
        )
    );
    console.log("--- Event output : Leverage");
    const events = await StrategyContract.getPastEvents("Leverage");

    events.forEach((evt, idx) => {
      const returnVal = evt.returnValues;

      console.log("----------------");
      console.log("Event nº: " + idx);
      console.log(
        `amountRequested: ${web3.utils.fromWei(
          returnVal.amountRequested.toString()
        )}`
      );
      console.log(
        `amountGiven: ${web3.utils.fromWei(returnVal.amountGiven.toString())}`
      );
      console.log(`deficit: ${returnVal.deficit}`);
      console.log(`flashLoan: ${returnVal.flashLoan}`);
    });
  } catch (error) {
    console.log(error);
  }
};

test();
