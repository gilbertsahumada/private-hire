// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice Simulation-only receiver. A mock forwarder does NOT authenticate a live DON.
/// @dev No custody, escrow, production workflow identity, or payment functionality.
contract ProbeReceiver is IReceiver {
    struct Report {
        uint256 schemaVersion;
        uint256 chainId;
        address receiver;
        bytes32 probeId;
        bytes32 resultHash;
        uint8 decision;
        uint256 validUntil;
    }
    address public immutable forwarder;
    bool public constant SIMULATION_ONLY = true;
    mapping(bytes32 => bytes32) public reportHashes;
    mapping(bytes32 => uint8) public decisions;
    event ProbeRecorded(bytes32 indexed probeId, bytes32 resultHash, uint8 decision);
    error InvalidForwarder();
    error InvalidReport();
    error ExpiredReport();
    error Replay();

    constructor(address mockForwarder) {
        if (mockForwarder == address(0)) revert InvalidForwarder();
        forwarder = mockForwarder;
    }
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }
    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert InvalidForwarder();
        if (report.length != 224) revert InvalidReport();
        Report memory r = abi.decode(report, (Report));
        if (r.schemaVersion != 1 || r.chainId != block.chainid || r.receiver != address(this) || r.probeId == bytes32(0) || r.resultHash == bytes32(0) || (r.decision != 1 && r.decision != 2)) revert InvalidReport();
        if (block.timestamp >= r.validUntil) revert ExpiredReport();
        if (reportHashes[r.probeId] != bytes32(0)) revert Replay();
        reportHashes[r.probeId] = keccak256(report);
        decisions[r.probeId] = r.decision;
        emit ProbeRecorded(r.probeId, r.resultHash, r.decision);
    }
}
