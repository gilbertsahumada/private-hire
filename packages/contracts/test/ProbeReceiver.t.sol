// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ProbeReceiver, IReceiver} from "../src/ProbeReceiver.sol";
interface Vm { function prank(address) external; function expectRevert(bytes4) external; function expectRevert() external; function warp(uint256) external; }
contract ProbeReceiverTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant FORWARDER = address(0x1234);
    ProbeReceiver receiver;
    function setUp() public { receiver = new ProbeReceiver(FORWARDER); }
    function report() internal view returns (ProbeReceiver.Report memory) { return ProbeReceiver.Report(1, block.chainid, address(receiver), bytes32(uint256(1)), bytes32(uint256(2)), 1, block.timestamp + 60); }
    function send(ProbeReceiver.Report memory r) internal { vm.prank(FORWARDER); receiver.onReport("", abi.encode(r)); }
    function testAcceptAndReplay() public { ProbeReceiver.Report memory r = report(); send(r); require(receiver.decisions(r.probeId) == 1); vm.expectRevert(ProbeReceiver.Replay.selector); send(r); }
    function testReject() public { ProbeReceiver.Report memory r = report(); r.decision = 2; send(r); require(receiver.decisions(r.probeId) == 2); }
    function testCaller() public { vm.expectRevert(ProbeReceiver.InvalidForwarder.selector); receiver.onReport("", abi.encode(report())); }
    function testChain() public { ProbeReceiver.Report memory r = report(); r.chainId++; vm.expectRevert(ProbeReceiver.InvalidReport.selector); send(r); }
    function testDestination() public { ProbeReceiver.Report memory r = report(); r.receiver = address(9); vm.expectRevert(ProbeReceiver.InvalidReport.selector); send(r); }
    function testVersion() public { ProbeReceiver.Report memory r = report(); r.schemaVersion = 2; vm.expectRevert(ProbeReceiver.InvalidReport.selector); send(r); }
    function testDecision() public { ProbeReceiver.Report memory r = report(); r.decision = 3; vm.expectRevert(ProbeReceiver.InvalidReport.selector); send(r); }
    function testExpiryBoundaryAndRetry() public { ProbeReceiver.Report memory r = report(); vm.warp(r.validUntil); vm.expectRevert(ProbeReceiver.ExpiredReport.selector); send(r); require(receiver.reportHashes(r.probeId) == bytes32(0)); r.validUntil++; send(r); }
    function testMalformed() public { vm.expectRevert(ProbeReceiver.InvalidReport.selector); vm.prank(FORWARDER); receiver.onReport("", hex"00"); }
    function testTrailingBytes() public { vm.expectRevert(ProbeReceiver.InvalidReport.selector); vm.prank(FORWARDER); receiver.onReport("", bytes.concat(abi.encode(report()), hex"00")); }
    function testZeroForwarder() public { vm.expectRevert(ProbeReceiver.InvalidForwarder.selector); new ProbeReceiver(address(0)); }
    function testInterfaces() public view { require(receiver.supportsInterface(type(IReceiver).interfaceId)); require(receiver.supportsInterface(0x01ffc9a7)); require(!receiver.supportsInterface(0xffffffff)); }
}
