// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IArcEscrow} from "../src/JobEvaluator.sol";

interface ForkVm {
    function createSelectFork(string calldata rpc) external returns(uint256);
    function envOr(string calldata name,string calldata fallbackValue) external returns(string memory);
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert() external;
}
interface ArcCommerce is IArcEscrow {
    function createJob(address,address,uint256,string calldata,address) external returns(uint256);
    function setBudget(uint256,uint256,bytes calldata) external;
    function fund(uint256,bytes calldata) external;
    function submit(uint256,bytes32,bytes calldata) external;
    function paymentToken() external view returns(address);
    function platformFeeBP() external view returns(uint256);
    function evaluatorFeeBP() external view returns(uint256);
}

/// @notice Opt-in read-only RPC fork. Mutations below affect the ephemeral fork only.
contract ArcCompatibilityTest {
    ForkVm constant vm=ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ArcCommerce constant escrow=ArcCommerce(0x0747EEf0706327138c69792bF28Cd525089e4583);
    bool enabled;
    address constant PROVIDER=address(0x1234);

    function setUp() public {
        string memory rpc=vm.envOr("ARC_FORK_RPC",string(""));
        enabled=bytes(rpc).length!=0;
        if(enabled) vm.createSelectFork(rpc);
    }

    function testForkDocumentsZeroBudgetAndLateSubmission() public {
        if(!enabled)return;
        require(escrow.paymentToken()==0x3600000000000000000000000000000000000000);
        require(escrow.platformFeeBP()==0&&escrow.evaluatorFeeBP()==0);
        uint256 expiry=block.timestamp+600;
        uint256 id=escrow.createJob(PROVIDER,address(this),expiry,"compatibility fixture",address(0));
        escrow.fund(id,"");
        require(escrow.getJob(id).status==1);
        vm.warp(expiry);
        vm.prank(PROVIDER);escrow.submit(id,bytes32(uint256(1)),"");
        require(escrow.getJob(id).status==2);
        escrow.complete(id,bytes32(uint256(2)),"");
        require(escrow.getJob(id).status==3);
    }

    function testForkProviderOnlyBudgetAndExpiryFunding() public {
        if(!enabled)return;
        uint256 expiry=block.timestamp+600;
        uint256 id=escrow.createJob(PROVIDER,address(this),expiry,"compatibility fixture",address(0));
        vm.expectRevert();escrow.setBudget(id,10000,"");
        vm.prank(PROVIDER);escrow.setBudget(id,10000,"");
        require(escrow.getJob(id).budget==10000);
        vm.warp(expiry);
        vm.expectRevert();escrow.fund(id,"");
    }
}
