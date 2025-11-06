/**
 * Home Data Parsing Utilities
 *
 * Shared utility functions for parsing modem AT command responses
 * Used by both the original home-data hook and the new home-data-new hook
 *
 * Extracted from: hooks/home-data.ts
 */

import { BANDWIDTH_MAP, NR_BANDWIDTH_MAP } from "@/constants/home/index";

/**
 * Parse a field from an AT command response
 *
 * @param response - The AT command response string
 * @param lineIndex - Index of the line to parse
 * @param firstField - Index after first delimiter
 * @param fieldIndex - Index after second delimiter
 * @param defaultValue - Default value if parsing fails
 * @param firstDelimiter - First delimiter character
 * @param secondDelimiter - Second delimiter character
 * @returns The parsed field value or default
 */
export const parseField = (
  response: string,
  lineIndex: number,
  firstField: number,
  fieldIndex: number,
  defaultValue = "Unknown",
  firstDelimiter = ":",
  secondDelimiter = ","
): string => {
  try {
    return (
      response
        .split("\n")
        [lineIndex]?.split(firstDelimiter)
        [firstField]?.split(secondDelimiter)
        [fieldIndex]?.replace(/"/g, "")
        .trim() || defaultValue
    );
  } catch {
    return defaultValue;
  }
};

/**
 * Extract and process IPv4 or IPv6 address
 *
 * @param rawData - Raw AT command response data array
 * @param type - IP address type (IPV4 or IPV6)
 * @param defaultValue - Default value if parsing fails
 * @returns The parsed IP address or default
 */
export const extractIPAddress = (
  rawData: any,
  type: "IPV4" | "IPV6",
  defaultValue = "-"
): string => {
  const line = rawData[15]?.response
    ?.split("\n")
    .find(
      (line: string) =>
        line.includes('QMAP: "WWAN"') && line.includes(`"${type}"`)
    );
  const ipAddress = parseField(line || "", 0, 1, 4, defaultValue, " ", ",");
  const parsedIP = type == "IPV6" ? ipAddress.replace(/::/g, ":") : ipAddress;
  const invalid_values = [
    "0.0.0.0",
    "::",
    "::0",
    "::0:0:0:0:0:0:0:0",
    "0:0:0:0:0:0:0:0",
  ];
  return invalid_values.includes(parsedIP) ? defaultValue : parsedIP;
};

/**
 * Parse DNS address from CGCONTRDP response
 *
 * @param rawData - Raw AT command response data array
 * @param networkType - Current network type
 * @param profileIndex - Index of QMAP response in rawData
 * @param dnsFieldIndex - DNS field index map by network type
 * @param cdgcontIndex - Index of CGCONTRDP response in rawData
 * @param defaultValue - Default value if parsing fails
 * @returns The parsed DNS address or default
 */
export const parseDNSAddress = (
  rawData: any,
  networkType: string,
  profileIndex: number,
  dnsFieldIndex: Record<string, number>,
  cdgcontIndex: number,
  defaultValue = "-"
): string => {
  try {
    if (!rawData[profileIndex]?.response || !rawData[cdgcontIndex]?.response)
      return defaultValue;

    // Step 1: Get profile ID from QMAP="WWAN" response
    const qmapLines = rawData[profileIndex].response
      .split("\n")
      .filter((line: string) => line.includes('+QMAP: "WWAN"'));

    const profileIDMatch = qmapLines[0]?.match(/\+QMAP: "WWAN",\d+,(\d+),/);
    const profileID = profileIDMatch ? profileIDMatch[1] : null;

    if (!profileID) return defaultValue;

    // Step 2: Find matching CID in CGCONTRDP
    const cgcontrdpLines = rawData[cdgcontIndex].response
      .split("\n")
      .filter((line: string) => line.includes("+CGCONTRDP:"));

    const matchingLine = cgcontrdpLines.find((line: string) => {
      const cid = line.match(/\+CGCONTRDP: (\d+),/);
      return cid && cid[1] === profileID;
    });

    if (!matchingLine) return defaultValue;

    // Step 3: Extract DNS field
    const parts = matchingLine.split(",");
    if (parts.length <= dnsFieldIndex[networkType]) return defaultValue;
    return (
      parts[dnsFieldIndex[networkType]].replace(/"/g, "").trim() || defaultValue
    );
  } catch (error) {
    console.error("Error parsing DNS address:", error);
    return defaultValue;
  }
};

/**
 * Format DNS address (handles IPv4 and dotted IPv6)
 *
 * @param dnsAddress - DNS address to format
 * @returns Formatted DNS address
 */
export const formatDNSAddress = (dnsAddress: string): string => {
  try {
    const isIPv4 = dnsAddress.match(
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    );
    const isDottedIPv6 = dnsAddress.split(".").length > 4;
    return isIPv4
      ? dnsAddress
      : isDottedIPv6
      ? formatDottedIPv6(dnsAddress)
      : dnsAddress.replace(/:{3,}/g, "::");
  } catch (error) {
    console.error("Error formatting DNS address:", error);
    return dnsAddress;
  }
};

/**
 * Format dotted IPv6 address to standard IPv6 format
 *
 * @param dottedIPv6 - Dotted IPv6 address
 * @returns Formatted IPv6 address
 */
export const formatDottedIPv6 = (dottedIPv6: string): string => {
  try {
    // Split by dots
    const parts = dottedIPv6.split(".");

    // Only process if it looks like a dotted IPv6
    if (parts.length < 8) return dottedIPv6;

    // Convert each decimal to 2-digit hex
    const hexParts = parts.map((part) => {
      const num = parseInt(part, 10);
      if (isNaN(num)) return "00";
      return num.toString(16).padStart(2, "0");
    });

    // Group into 8 blocks of 2 bytes each
    const ipv6Blocks = [];
    for (let i = 0; i < hexParts.length; i += 2) {
      if (i + 1 < hexParts.length) {
        ipv6Blocks.push(hexParts[i] + hexParts[i + 1]);
      } else {
        ipv6Blocks.push(hexParts[i] + "00");
      }
    }

    // Remove leading zeros from each block
    const cleanedBlocks = ipv6Blocks.map(
      (block) => block.replace(/^0+/, "") || "0"
    );

    // Find longest run of zeros for compression
    let longestZeros: string | any[] = [];
    let currentZeros = [];

    for (let i = 0; i < cleanedBlocks.length; i++) {
      if (cleanedBlocks[i] === "0") {
        currentZeros.push(i);
      } else if (currentZeros.length > 0) {
        if (currentZeros.length > longestZeros.length) {
          longestZeros = [...currentZeros];
        }
        currentZeros = [];
      }
    }

    // Check final run of zeros
    if (currentZeros.length > longestZeros.length) {
      longestZeros = [...currentZeros];
    }

    // Apply zero compression if we have at least 2 consecutive zeros
    if (longestZeros.length >= 2) {
      const result = [];
      for (let i = 0; i < cleanedBlocks.length; i++) {
        if (i === longestZeros[0]) {
          result.push(""); // Start of compressed section
          i = longestZeros[longestZeros.length - 1]; // Skip to end of zeros
        } else {
          result.push(cleanedBlocks[i]);
        }
      }

      return result.join(":").replace(/::+/g, "::");
    }

    // If no compression, just join the blocks
    return cleanedBlocks.join(":");
  } catch (err) {
    console.error("Error formatting IPv6:", err);
    return dottedIPv6;
  }
};

/**
 * Get access technology from COPS response
 *
 * @param response - COPS AT command response
 * @returns Access technology (e.g., "LTE", "5G")
 */
export const getAccessTechnology = (response: string): string => {
  return parseField(response, 1, 1, 3);
};

/**
 * Get operator registration state
 *
 * @param lteResponse - CREG response
 * @param nr5gResponse - C5GREG response
 * @returns Registration state
 */
export const getOperatorState = (
  lteResponse: string,
  nr5gResponse: string
):
  | "Unknown"
  | "Registered"
  | "Searching"
  | "Denied"
  | "Roaming"
  | "Not Registered" => {
  const state =
    Number(parseField(lteResponse, 1, 1, 1)) ||
    Number(parseField(nr5gResponse, 1, 1, 1));
  const stateMap: Record<
    number,
    | "Unknown"
    | "Registered"
    | "Searching"
    | "Denied"
    | "Roaming"
    | "Not Registered"
  > = {
    1: "Registered",
    2: "Searching",
    3: "Denied",
    4: "Unknown",
    5: "Roaming",
  };
  return stateMap[state] || "Not Registered";
};

/**
 * Get network type from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @returns Network type (LTE, NR5G-SA, NR5G-NSA, or No Signal)
 */
export const getNetworkType = (response: string): string => {
  const bands = response.match(/"LTE BAND \d+"|"NR5G BAND \d+"/g) || [];
  const hasLTE = bands?.some((band) => band.includes("LTE"));
  const hasNR5G = bands?.some((band) => band.includes("NR5G"));
  return hasLTE && hasNR5G
    ? "NR5G-NSA"
    : hasLTE
    ? "LTE"
    : hasNR5G
    ? "NR5G-SA"
    : "No Signal";
};

/**
 * Get modem temperature from QTEMP response
 *
 * @param response - QTEMP AT command response
 * @returns Formatted temperature string (e.g., "45°C")
 */
export const getModemTemperature = (response: string): string => {
  const temps = ["cpuss-0", "cpuss-1", "cpuss-2", "cpuss-3"].map((cpu) => {
    const line = response.split("\n").find((l) => l.includes(cpu));
    return parseInt(
      line!?.split(":")[1]?.split(",")[1].replace(/"/g, "").trim()
    );
  });
  const avgTemp = temps.reduce((acc, t) => acc + t, 0) / temps.length;
  return `${Math.round(avgTemp)}°C`;
};

/**
 * Get signal strength percentage from RSRP values
 *
 * @param response - QRSRP AT command response
 * @returns Signal strength percentage (e.g., "75%")
 */
export const getSignalStrength = (response: string): string => {
  const INVALID_RSRP_VALUES = [-140, -37625, -32768];
  // Helper function to extract and filter RSRP values
  const extractRSRP = (line?: string): number[] =>
    line
      ?.split(":")[1]
      ?.split(",")
      .slice(0, 4)
      .map((v) => parseInt(v.trim()))
      .filter((v) => !INVALID_RSRP_VALUES.includes(v)) || [];

  // Extract RSRP values for LTE and NR5G
  const rsrpLteArr = extractRSRP(
    response.split("\n").find((l) => l.includes("LTE"))
  );
  const rsrpNrArr = extractRSRP(
    response.split("\n").find((l) => l.includes("NR5G"))
  );

  // Helper function to calculate percentage
  const calculatePercentage = (values: number[]): number =>
    Math.max(
      0,
      Math.min(
        100,
        ((values.reduce((acc, v) => acc + v, 0) / values.length + 125) / 50) *
          100
      )
    );

  // Calculate signal strength percentages
  const ltePercentage = rsrpLteArr.length
    ? calculatePercentage(rsrpLteArr)
    : null;
  const nrPercentage = rsrpNrArr.length ? calculatePercentage(rsrpNrArr) : null;

  // Determine final signal strength
  return ltePercentage !== null && nrPercentage !== null
    ? `${Math.round((ltePercentage + nrPercentage) / 2)}%`
    : ltePercentage !== null
    ? `${Math.round(ltePercentage)}%`
    : nrPercentage !== null
    ? `${Math.round(nrPercentage)}%`
    : "Unknown%";
};

/**
 * Extract TAC or Cell ID value from QENG response
 * Converts hex to decimal if raw=false
 *
 * @param response - QENG servingcell response
 * @param networkType - Current network type
 * @param lineIndexMap - Line index map by network type
 * @param fieldIndexMap - Field index map by network type
 * @param raw - Return raw hex value if true, decimal if false
 * @returns Extracted value (decimal or hex)
 */
export const extractValueByNetworkType = (
  response: string,
  networkType: string,
  lineIndexMap: Record<string, number>,
  fieldIndexMap: Record<string, number>,
  raw = false
): string => {
  const lineIndex = lineIndexMap[networkType];
  const fieldIndex = fieldIndexMap[networkType];
  return lineIndex !== undefined && fieldIndex !== undefined && !raw
    ? parseInt(parseField(response, lineIndex, 1, fieldIndex), 16)
        .toString()
        .toUpperCase()
    : lineIndex !== undefined && fieldIndex !== undefined && raw
    ? parseField(response, lineIndex, 1, fieldIndex).toUpperCase()
    : "Unknown";
};

/**
 * Get MCC or MNC network code from QENG response
 *
 * @param response - QENG servingcell response
 * @param networkType - Current network type
 * @param fieldIndexMap - Field index map by network type
 * @returns Network code (MCC or MNC)
 */
export const getNetworkCode = (
  response: string,
  networkType: string,
  fieldIndexMap: Record<string, number>
): string => {
  const lineIndex = networkType === "NR5G-NSA" ? 2 : 1;
  const fieldIndex = fieldIndexMap[networkType];
  return parseField(response, lineIndex, 1, fieldIndex);
};

/**
 * Get signal quality percentage from SINR values
 *
 * @param response - QSINR AT command response
 * @returns Signal quality percentage (e.g., "80%")
 */
export const getSignalQuality = (response: string): string => {
  const INVALID_VALUES = [-140, -32768, -37625];
  const parseSignalValues = (line?: string): number[] =>
    parseField(line || "", 0, 1, 1, "Unknown", ":", " ")
      .split(",")
      .slice(0, 4)
      .map((v) => parseInt(v.trim()))
      .filter((v) => !INVALID_VALUES.includes(v)) || [];
  const calculatePercentage = (values: number[]): number =>
    values.length
      ? Math.max(
          0,
          Math.min(
            100,
            ((values.reduce((acc, v) => acc + v, 0) / values.length - -10) /
              40) *
              100
          )
        )
      : 0;

  const lines = response.split("\n");
  const ltePercentage = calculatePercentage(
    parseSignalValues(lines.find((l) => l.includes("LTE")))
  );
  const nrPercentage = calculatePercentage(
    parseSignalValues(lines.find((l) => l.includes("NR5G")))
  );
  return ltePercentage && nrPercentage
    ? `${Math.round((ltePercentage + nrPercentage) / 2)}%`
    : ltePercentage
    ? `${Math.round(ltePercentage)}%`
    : nrPercentage
    ? `${Math.round(nrPercentage)}%`
    : "Unknown%";
};

/**
 * Get band numbers from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @returns Array of band numbers (e.g., ["LTE BAND 2", "NR5G BAND 41"])
 */
export const getCurrentBandsBandNumber = (response: string): string[] => {
  const extractBands = (lines: string[]): string[] =>
    lines.map((line) => parseField(line, 0, 1, 3, "Unknown", ":", ","));

  const bandsLte = extractBands(
    response.split("+QCAINFO").filter((line) => line.includes("LTE BAND"))
  );
  const bandsNr5g = extractBands(
    response.split("+QCAINFO").filter((line) => line.includes("NR5G BAND"))
  );

  const allBands = [...bandsLte, ...bandsNr5g];
  return allBands.length ? allBands : ["Unknown"];
};

/**
 * Get EARFCN/ARFCN values from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @returns Array of EARFCN values
 */
export const getCurrentBandsEARFCN = (response: string): string[] => {
  const extractEARFCNs = (type: string) =>
    response
      .split("+QCAINFO")
      .filter((line) => line.includes(type))
      .map((line) => line.split(":")[1]?.split(",")[1]?.trim() || "Unknown");

  const earfcnsLte = extractEARFCNs("LTE BAND");
  const earfcnsNr5g = extractEARFCNs("NR5G BAND");

  return [...earfcnsLte, ...earfcnsNr5g].length
    ? [...earfcnsLte, ...earfcnsNr5g]
    : ["Unknown"];
};

/**
 * Get bandwidth values from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @returns Array of bandwidth values (e.g., ["20 MHz", "100 MHz"])
 */
export const getCurrentBandsBandwidth = (response: string): string[] => {
  const extractBandwidths = (type: string, map: Record<string, string>) =>
    response
      .split("+QCAINFO")
      .filter((line) => line.includes(type))
      .map((line) => map[line.split(":")[1]?.split(",")[2]] || "Unknown");

  const bandwidthsLte = extractBandwidths("LTE BAND", BANDWIDTH_MAP);
  const bandwidthsNr5g = extractBandwidths("NR5G BAND", NR_BANDWIDTH_MAP);

  return [...bandwidthsLte, ...bandwidthsNr5g].length
    ? [...bandwidthsLte, ...bandwidthsNr5g]
    : ["Unknown"];
};

/**
 * Get Physical Cell ID values from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @param networkType - Current network type
 * @returns Array of PCI values
 */
export const getCurrentBandsPCI = (
  response: string,
  networkType: string
): string[] => {
  const getPCIFromParts = (parts: string[] | undefined): string => {
    if (!parts) return "Unknown";
    const pciIndex: 4 | 5 = (() => {
      switch (parts.length) {
        case 8: // length 8, PCI is at index 4, NR5G PCC and NR5G SCC Band when NR5G-NSA
          return 4;
        case 13: // length 13, PCI is at index 5, LTE SCC Band
        case 12: // length 12, PCI is at index 5, NR5G SCC Band
        case 10: // length 10, PCI is at index 5, LTE PCC Band
        default:
          return 5;
      }
    })();
    return parts[pciIndex]?.trim() || "Unknown";
  };
  const extractPCI = (lines: string[]): string[] =>
    lines.map((line) => getPCIFromParts(line.split(":")[1]?.split(",")));

  const lines = response.split("+QCAINFO");
  const pccPCI = extractPCI(lines.filter((l) => l.includes("PCC")))[0];
  const sccPCIs = extractPCI(lines.filter((l) => l.includes("SCC")));
  return [pccPCI, ...sccPCIs].filter((pci) => pci !== "Unknown");
};

/**
 * Get RSRP values from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @returns Array of RSRP values
 */
export const getCurrentBandsRSRP = (response: string): string[] => {
  const getRSRPFromParts = (parts: string[] | undefined): string => {
    if (!parts) return "Unknown";
    const pciIndex: 5 | 6 | 9 = (() => {
      switch (parts.length) {
        case 8: // length 8, RSRP is at index 4, NR SA PCC and NR NSA SCC Band when NR5G-NSA
          return 5;
        case 12: // length 12, RSRP is at index 5, NR NSA/SA SCC Band X
          return 9;
        case 13: // length 13, RSRP is at index 5, LTE SCC Band X
        case 10: // length 10, RSRP is at index 5, LTE/NR NSA PCC Band X
        default:
          return 6;
      }
    })();
    return parts[pciIndex]?.trim() || "Unknown";
  };

  const extractRSRP = (lines: string[]): string[] => {
    return lines.map((line) =>
      getRSRPFromParts(line.split(":")[1]?.split(","))
    );
  };
  const lines = response.split("+QCAINFO");
  const pccRSRP = extractRSRP(lines.filter((l) => l.includes("PCC")))[0];
  const sccRSRPs = extractRSRP(lines.filter((l) => l.includes("SCC")));
  return [pccRSRP, ...sccRSRPs].filter((pci) => pci !== "Unknown");
};

/**
 * Get RSRQ values from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @returns Array of RSRQ values
 */
export const getCurrentBandsRSRQ = (response: string): string[] => {
  const getRSRQFromParts = (parts: string[] | undefined): string => {
    if (!parts) return "Unknown";
    const pciIndex: 6 | 7 | 10 = (() => {
      switch (parts.length) {
        case 8: // length 8, RSRQ is at index 4, NR SA PCC and NR NSA SCC Band when NR5G-NSA
          return 6;
        case 12: // length 12, RSRQ is at index 5, NR NSA/SA SCC Band X
          return 10;
        case 13: // length 13, RSRQ is at index 5, LTE SCC Band X
        case 10: // length 10, RSRQ is at index 5, LTE/NR NSA PCC Band X
        default:
          return 7;
      }
    })();
    return parts[pciIndex]?.trim() || "Unknown";
  };

  const extractRSRQ = (lines: string[]): string[] => {
    return lines.map((line) =>
      getRSRQFromParts(line.split(":")[1]?.split(","))
    );
  };
  const lines = response.split("+QCAINFO");
  const pccRSRQ = extractRSRQ(lines.filter((l) => l.includes("PCC")))[0];
  const sccRSRQs = extractRSRQ(lines.filter((l) => l.includes("SCC")));
  return [pccRSRQ, ...sccRSRQs].filter((pci) => pci !== "Unknown");
};

/**
 * Get SINR values from QCAINFO response
 *
 * @param response - QCAINFO AT command response
 * @param networkType - Current network type
 * @returns Array of SINR values
 */
export const getCurrentBandsSINR = (
  response: string,
  networkType: string
): string[] => {
  const getSINRFromParts = (parts: string[] | undefined): string => {
    if (!parts) return "Unknown";
    const pciIndex: 7 | 8 | 9 | 11 = (() => {
      switch (parts.length) {
        case 9: // length 8, NR SA PCC and NR NSA SCC Band when NR5G-NSA
          return 8;
        case 8: // length 8, NR SA PCC and NR NSA SCC Band when NR5G-NSA
          return 7;
        case 12: // length 12, NR NSA/SA SCC Band X
          return 11;
        case 13: // length 13, LTE SCC Band X
        case 10: // length 10, LTE/NR NSA PCC Band X
        default:
          return 9;
      }
    })();
    return parts[pciIndex]?.trim() || "Unknown";
  };

  const extractSINR = (lines: string[]): string[] =>
    lines.map((line) => {
      const rawSINR = getSINRFromParts(line.split(":")[1]?.split(","));
      if (rawSINR === "-32768") return "-";
      const calculatedSINR =
        parseInt(rawSINR) >= 4000
          ? "4000"
          : parseInt(rawSINR) < -3000
          ? "-"
          : rawSINR;
      return !isNaN(parseInt(calculatedSINR)) && !line.includes("LTE")
        ? Math.round(parseInt(calculatedSINR) / 100).toString()
        : calculatedSINR || "Unknown";
    });

  const lines = response.split("+QCAINFO");
  const pccSINR = extractSINR(lines.filter((l) => l.includes("PCC")))[0];
  const sccSINRs = extractSINR(lines.filter((l) => l.includes("SCC")));
  return [pccSINR, ...sccSINRs].filter((c) => c !== "Unknown");
};

/**
 * Get MIMO layer count from RSRP response
 *
 * @param response - QRSRP AT command response
 * @returns MIMO layer string (e.g., "LTE 2 | NR 4")
 */
export const getMimoLayers = (response: string): string => {
  const INVALID_VALUES = [-32768, -140];

  // Helper function to extract and filter RSRP values
  const extractRSRP = (line?: string): number[] =>
    parseField(line || "", 0, 1, 1, "-32768", ":", " ")
      .split(",")
      .slice(0, 4)
      .map((v) => parseInt(v.trim()))
      .filter((v) => !INVALID_VALUES.includes(v)) || [];

  // Extract RSRP values for LTE and NR5G
  const lteRSRPCount = extractRSRP(
    response.split("\n").find((l) => l.includes("LTE"))
  ).length;
  const nr5gRSRPCount = extractRSRP(
    response.split("\n").find((l) => l.includes("NR5G"))
  ).length;
  // Determine MIMO layers
  return lteRSRPCount && nr5gRSRPCount
    ? `LTE ${lteRSRPCount} |  NR ${nr5gRSRPCount}`
    : lteRSRPCount
    ? ` LTE ${lteRSRPCount}`
    : nr5gRSRPCount
    ? `NR ${nr5gRSRPCount}`
    : "Unknown";
};
