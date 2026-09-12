// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IReceiver} from "./ProbeReceiver.sol";

interface IArcEscrow {
    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        uint8 status;
        address hook;
    }

    function getJob(uint256 id) external view returns (Job memory);
    function complete(uint256 id, bytes32 reason, bytes calldata options) external;
    function reject(uint256 id, bytes32 reason, bytes calldata options) external;
}

/// @notice Testnet simulation evaluator. Mock forwarder is NOT production DON authentication.
/// @dev The escrow stores deliverables in logs only. CRE verifies their commitment before reporting.
contract JobEvaluator is IReceiver {
    struct Report {
        uint256 schemaVersion;
        uint256 chainId;
        address escrow;
        address receiver;
        uint256 jobId;
        bytes32 manifestHash;
        bytes32 deliverableHash;
        uint8 decision;
        uint256 validUntil;
    }

    address public immutable forwarder;
    IArcEscrow public immutable escrow;
    bool public constant SIMULATION_ONLY = true;
    mapping(bytes32 => bool) public processed;
    event JobEvaluated(uint256 indexed jobId, bytes32 indexed reportHash, uint8 decision);
    error InvalidConfiguration();
    error InvalidReport();
    error InvalidForwarder();
    error Replay();

    constructor(address mockForwarder, address escrowAddress) {
        if (mockForwarder == address(0) || escrowAddress.code.length == 0) revert InvalidConfiguration();
        forwarder = mockForwarder;
        escrow = IArcEscrow(escrowAddress);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }

    function onReport(bytes calldata, bytes calldata data) external {
        if (msg.sender != forwarder) revert InvalidForwarder();
        if (data.length != 288) revert InvalidReport();
        Report memory r = abi.decode(data, (Report));
        bytes32 reportHash = keccak256(data);
        if (processed[reportHash]) revert Replay();
        if (
            r.schemaVersion != 1 || r.chainId != block.chainid || r.escrow != address(escrow)
                || r.receiver != address(this) || r.manifestHash == bytes32(0) || r.deliverableHash == bytes32(0)
                || (r.decision != 1 && r.decision != 2) || block.timestamp >= r.validUntil
        ) revert InvalidReport();
        IArcEscrow.Job memory job = escrow.getJob(r.jobId);
        if (
            job.id != r.jobId || job.status != 2 || job.evaluator != address(this) || job.budget == 0
                || block.timestamp >= job.expiredAt || r.validUntil > job.expiredAt
                || keccak256(bytes(job.description)) != keccak256(bytes(hexHash(r.manifestHash)))
        ) revert InvalidReport();
        processed[reportHash] = true;
        if (r.decision == 1) escrow.complete(r.jobId, reportHash, "");
        else escrow.reject(r.jobId, reportHash, "");
        emit JobEvaluated(r.jobId, reportHash, r.decision);
    }

    function hexHash(bytes32 value) internal pure returns (string memory) {
        bytes16 alphabet = "0123456789abcdef";
        bytes memory result = new bytes(66);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i; i < 32; i++) {
            result[2 + i * 2] = alphabet[uint8(value[i]) >> 4];
            result[3 + i * 2] = alphabet[uint8(value[i]) & 15];
        }
        return string(result);
    }
}
