// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DateUtils
/// @notice Gregorian calendar helpers (UTC), based on Howard Hinnant's `civil_from_days` algorithm.
library DateUtils {
    /// @notice Calendar year (UTC) of a unix timestamp.
    function yearOf(uint256 timestamp) internal pure returns (uint256 year) {
        unchecked {
            uint256 z = timestamp / 86_400 + 719_468;
            uint256 era = z / 146_097;
            uint256 doe = z - era * 146_097; // [0, 146096]
            uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
            uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
            uint256 mp = (5 * doy + 2) / 153; // [0, 11], March-based month
            year = yoe + era * 400;
            if (mp >= 10) ++year; // January and February belong to the next civil year
        }
    }
}
