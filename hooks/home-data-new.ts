/**
 * Custom hook that fetches and processes cellular modem data for the home dashboard.
 *
 * NEW VERSION - Uses Next.js API routes instead of CGI scripts
 * Migrated from: hooks/home-data.ts
 *
 * Changes:
 * - Uses /api/modem/data instead of /cgi-bin/quecmanager/at_cmd/fetch_data.sh
 * - Uses /api/home/public-ip instead of /cgi-bin/quecmanager/home/fetch_public_ip.sh
 * - Authentication via httpOnly cookies
 * - Better error handling and type safety
 * - Consistent response format
 */

import { useState, useEffect, useCallback } from "react";
import { HomeData } from "@/types/types";

// Import all the parsing utility functions from the shared module
import {
  parseField,
  getOperatorState,
  getNetworkType,
  getModemTemperature,
  getAccessTechnology,
  getCurrentBandsBandwidth,
  getCurrentBandsBandNumber,
  getSignalStrength,
  getMimoLayers,
  extractValueByNetworkType,
  getCurrentBandsPCI,
  getCurrentBandsEARFCN,
  getNetworkCode,
  getSignalQuality,
  getCurrentBandsRSRP,
  getCurrentBandsRSRQ,
  getCurrentBandsSINR,
  extractIPAddress,
  parseDNSAddress,
  formatDNSAddress,
} from "@/utils/home-data-parsers";

interface ATCommandResult {
  command: string;
  response: string;
  status: 'success' | 'error';
  executionTime?: number;
}

interface ModemDataResponse {
  status: string;
  data: {
    set: number;
    commands: ATCommandResult[];
    timestamp: string;
  };
}

interface PublicIPResponse {
  status: string;
  data?: {
    public_ip: string;
  };
  error?: string;
}

const useHomeDataNew = () => {
  const [data, setData] = useState<HomeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isPublicIPLoading, setIsPublicIPLoading] = useState(true);

  // Separate function to fetch public IP
  const fetchPublicIP = useCallback(async () => {
    try {
      setIsPublicIPLoading(true);
      const publicIPResponse = await fetch("/api/home/public-ip", {
        method: 'GET',
        credentials: 'include', // Include httpOnly cookie
        headers: {
          'Accept': 'application/json',
        },
      });

      let publicIP = "Can't fetch public IP";
      if (publicIPResponse.ok) {
        const publicIPData: PublicIPResponse = await publicIPResponse.json();
        publicIP = publicIPData.error
          ? "No Internet"
          : publicIPData.data?.public_ip || "-";
      }

      // Update only the public IP in the existing data
      setData(prevData => prevData ? {
        ...prevData,
        networkAddressing: {
          ...prevData.networkAddressing,
          publicIPv4: publicIP
        }
      } : null);
    } catch (error) {
      console.error("Error fetching public IP:", error);
      // Set fallback value for public IP
      setData(prevData => prevData ? {
        ...prevData,
        networkAddressing: {
          ...prevData.networkAddressing,
          publicIPv4: "Can't fetch public IP"
        }
      } : null);
    } finally {
      setIsPublicIPLoading(false);
    }
  }, []);

  // Automated recovery function
  const handleErrorWithRetry = useCallback(
    async (err: Error) => {
      console.error("Error fetching home data:", err);

      if (retryCount < 2) {
        // Limit to 2 retry attempts
        console.log(
          `Attempting automatic recovery (attempt ${retryCount + 1}/2)...`
        );
        // Increment retry count and attempt refetch
        setRetryCount((prev) => prev + 1);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        fetchHomeData();
      } else {
        // After max retries, show error state and fallback data
        console.error("Max retry attempts reached. Please refresh manually.");
        setError(err);

        // Set fallback data with "Unknown" values
        setData({
          simCard: {
            slot: "Unknown",
            state: "Unknown",
            provider: "Unknown",
            phoneNumber: "Unknown",
            imsi: "Unknown",
            iccid: "Unknown",
            imei: "Unknown",
          },
          connection: {
            apn: "Unknown",
            operatorState: "Unknown",
            functionalityState: "Limited Functionality",
            networkType: "No Signal",
            modemTemperature: "Unknown",
            accessTechnology: "Unknown",
          },
          dataTransmission: {
            carrierAggregation: "Inactive",
            bandwidth: "Unknown",
            connectedBands: "Unknown",
            signalStrength: "Unknown",
            mimoLayers: "Unknown",
          },
          cellularInfo: {
            cellId: "Unknown",
            trackingAreaCode: "Unknown",
            cellIdRaw: "Unknown",
            trackingAreaCodeRaw: "Unknown",
            physicalCellId: "Unknown",
            earfcn: "Unknown",
            mcc: "Unknown",
            mnc: "Unknown",
            scs: 0,
            signalQuality: "Unknown",
          },
          currentBands: {
            id: [1],
            bandNumber: ["Unknown"],
            earfcn: ["Unknown"],
            bandwidth: ["Unknown"],
            pci: ["Unknown"],
            rsrp: ["Unknown"],
            rsrq: ["Unknown"],
            sinr: ["Unknown"],
          },
          networkAddressing: {
            publicIPv4: "Can't fetch public IP",
            cellularIPv4: "-",
            cellularIPv6: "-",
            carrierPrimaryDNS: "-",
            carrierSecondaryDNS: "-",
            rawCarrierPrimaryDNS: "-",
            rawCarrierSecondaryDNS: "-",
          },
          timeAdvance: {
            lteTimeAdvance: "Unknown",
            nrTimeAdvance: "Unknown",
          },
        });
      }
    },
    [retryCount]
  );

  const fetchHomeData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch modem data from new API endpoint
      const response = await fetch("/api/modem/data?set=1", {
        method: 'GET',
        credentials: 'include', // Include httpOnly cookie for auth
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ModemDataResponse = await response.json();

      if (result.status !== 'success' || !result.data) {
        throw new Error('Invalid response format from API');
      }

      // Convert commands array to rawData format (array of results)
      const rawData = result.data.commands;

      // Process the raw data using the same logic as the original hook
      // The indices match the command order in COMMAND_SETS[1] from /api/modem/data/route.ts
      const processedData: HomeData = {
        simCard: {
          slot: parseField(rawData[0].response, 1, 1, 0),
          state: rawData[6].response.includes("READY")
            ? "Inserted"
            : rawData[6].response.includes("PIN")
            ? "Waiting for PIN"
            : rawData[6].response.includes("PUK")
            ? "Waiting for Password"
            : rawData[6].response.toLowerCase().includes("failed")
            ? "SMS-Tool Failed Token"
            : "Unknown",
          provider: parseField(rawData[2].response, 1, 1, 2),
          phoneNumber: parseField(rawData[1].response, 1, 1, 1),
          imsi: parseField(rawData[3].response, 1, 0, 0),
          iccid: parseField(rawData[4].response, 1, 1, 1, "Unknown", ":", " "),
          imei: parseField(rawData[5].response, 1, 0, 0),
        },
        connection: {
          apn: parseField(
            rawData[7]?.response,
            1,
            1,
            2,
            parseField(rawData[12]?.response, 1, 1, 2)
          ),
          operatorState:
            getOperatorState(rawData[8]?.response, rawData[16]?.response) ||
            "Unknown",
          functionalityState:
            parseField(rawData[9]?.response, 1, 1, 0) === "1"
              ? "Full Functionality"
              : "Limited Functionality",
          networkType: (getNetworkType(rawData[13]?.response || "") || "No Signal") as "NR5G-NSA" | "LTE" | "NR5G-SA" | "No Signal",
          modemTemperature:
            getModemTemperature(rawData[11].response) || "Unknown",
          accessTechnology:
            getAccessTechnology(rawData[2].response) || "Unknown",
        },
        dataTransmission: {
          carrierAggregation:
            ((rawData[13]?.response || "").match(/"LTE BAND \d+"|"NR5G BAND \d+"/g)
              ?.length || 0) > 1
              ? "Multi"
              : "Inactive",
          bandwidth:
            getCurrentBandsBandwidth(rawData[13]?.response || "").join(", ") ||
            "Unknown",
          connectedBands:
            getCurrentBandsBandNumber(rawData[13]?.response || "")
              .join(", ")
              .replaceAll("LTE BAND ", "B")
              .replaceAll("NR5G BAND ", "N") || "Unknown",
          signalStrength: getSignalStrength(rawData[14].response) || "Unknown",
          mimoLayers: getMimoLayers(rawData[14].response) || "Unknown",
        },
        cellularInfo: {
          cellId: extractValueByNetworkType(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-SA": 1, "NR5G-NSA": 2, LTE: 1 },
            { "NR5G-SA": 6, "NR5G-NSA": 4, LTE: 6 },
            false
          ),
          trackingAreaCode: extractValueByNetworkType(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-SA": 1, "NR5G-NSA": 2, LTE: 1 },
            { "NR5G-SA": 8, "NR5G-NSA": 10, LTE: 12 },
            false
          ),
          cellIdRaw: extractValueByNetworkType(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-SA": 1, "NR5G-NSA": 2, LTE: 1 },
            { "NR5G-SA": 6, "NR5G-NSA": 4, LTE: 6 },
            true
          ),
          trackingAreaCodeRaw: extractValueByNetworkType(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-SA": 1, "NR5G-NSA": 2, LTE: 1 },
            { "NR5G-SA": 8, "NR5G-NSA": 10, LTE: 12 },
            true
          ),
          physicalCellId:
            getCurrentBandsPCI(
              rawData[13]?.response || "",
              getNetworkType(rawData[13]?.response || "")
            ).join(", ") || "Unknown",
          earfcn: getCurrentBandsEARFCN(rawData[13]?.response || "").join(", "),
          mcc: getNetworkCode(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-NSA": 2, LTE: 4, "NR5G-SA": 4 }
          ),
          mnc: getNetworkCode(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-NSA": 3, LTE: 5, "NR5G-SA": 5 }
          ),
          scs: Number(extractValueByNetworkType(
            rawData[10]?.response,
            getNetworkType(rawData[13]?.response),
            { "NR5G-SA": 1, "NR5G-NSA": 2, LTE: 1 },
            { "NR5G-SA": 15, "NR5G-NSA": 10, LTE: 0 },
            true
          )) || 0,
          signalQuality: getSignalQuality(rawData[19].response) || "Unknown",
        },
        currentBands: {
          id: Array.from(
            {
              length:
                getCurrentBandsBandNumber(rawData[13]?.response || "")?.length ?? 0,
            },
            (_, i) => i + 1
          ) || [1],
          bandNumber: getCurrentBandsBandNumber(rawData[13]?.response || "") || [
            "Unknown",
          ],
          earfcn: getCurrentBandsEARFCN(rawData[13]?.response || ""),
          bandwidth: getCurrentBandsBandwidth(rawData[13]?.response || "") || [
            "Unknown",
          ],
          pci: getCurrentBandsPCI(
            rawData[13]?.response || "",
            getNetworkType(rawData[13]?.response || "")
          ) || ["Unknown"],
          rsrp: getCurrentBandsRSRP(rawData[13]?.response || ""),
          rsrq: getCurrentBandsRSRQ(rawData[13]?.response || "") || ["Unknown"],
          sinr: getCurrentBandsSINR(
            rawData[13]?.response || "",
            getNetworkType(rawData[13]?.response || "")
          ) || ["Unknown"],
        },
        networkAddressing: {
          publicIPv4: "Fetching...", // Will be fetched separately
          cellularIPv4: extractIPAddress(rawData, "IPV4"),
          cellularIPv6: extractIPAddress(rawData, "IPV6"),
          carrierPrimaryDNS: formatDNSAddress(
            parseDNSAddress(
              rawData,
              getNetworkType(rawData[13]?.response),
              15,
              { "NR5G-SA": 5, "NR5G-NSA": 6, LTE: 6 },
              20
            )
          ),
          carrierSecondaryDNS: formatDNSAddress(
            parseDNSAddress(
              rawData,
              getNetworkType(rawData[13]?.response),
              15,
              { "NR5G-SA": 6, "NR5G-NSA": 7, LTE: 7 },
              20
            )
          ),
          rawCarrierPrimaryDNS: parseDNSAddress(
            rawData,
            getNetworkType(rawData[13]?.response),
            15,
            { "NR5G-SA": 5, "NR5G-NSA": 6, LTE: 6 },
            20
          ),
          rawCarrierSecondaryDNS: parseDNSAddress(
            rawData,
            getNetworkType(rawData[13]?.response),
            15,
            { "NR5G-SA": 6, "NR5G-NSA": 7, LTE: 7 },
            20
          ),
        },
        timeAdvance: {
          lteTimeAdvance: parseField(rawData[21]?.response, 1, 1, 2),
          nrTimeAdvance: parseField(rawData[22]?.response, 1, 1, 2),
        },
      };

      setData(processedData);
      setRetryCount(0); // Reset retry count on success

      // Fetch public IP after initial data is loaded
      fetchPublicIP();
    } catch (err) {
      await handleErrorWithRetry(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPublicIP, handleErrorWithRetry]);

  // Auto-fetch on mount and set up polling interval
  useEffect(() => {
    fetchHomeData();

    // Polling interval for auto-refresh (every 5 seconds)
    const intervalId = setInterval(fetchHomeData, 5000);

    return () => clearInterval(intervalId);
  }, [fetchHomeData]);

  // Manual refresh function
  const refresh = useCallback(() => {
    setRetryCount(0); // Reset retry count
    fetchHomeData();
  }, [fetchHomeData]);

  return {
    data,
    isLoading,
    error,
    refresh,
    isPublicIPLoading,
  };
};

export default useHomeDataNew;

/**
 * Migration note:
 *
 * To migrate from old home-data.ts to this new version:
 *
 * 1. Replace import:
 *    - Old: import useHomeData from '@/hooks/home-data'
 *    - New: import useHomeDataNew from '@/hooks/home-data-new'
 *
 * 2. API changes:
 *    - Now uses /api/modem/data instead of CGI scripts
 *    - Authentication via httpOnly cookies (automatic)
 *    - Better error handling with retry logic
 *    - Consistent response format
 *
 * 3. Usage remains the same:
 *    const { data, isLoading, error, refresh } = useHomeDataNew();
 *
 * 4. Benefits:
 *    - Faster response times (no CGI overhead)
 *    - Better type safety
 *    - More secure authentication
 *    - Cleaner error handling
 */
