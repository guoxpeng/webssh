package com.webssh.app;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Host resource probe — verbatim port of STATS_SCRIPT / parseStats from
 * core/worker/index.mjs, so the frontend monitor panel receives the exact
 * same {type:"host_stats", data:{...}} payload shape.
 */
final class StatsProbe {

    private StatsProbe() {}

    static final String SCRIPT =
            "cpu1=$(head -n1 /proc/stat 2>/dev/null)\n"
            + "rx1=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')\n"
            + "tx1=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')\n"
            + "sleep 1\n"
            + "cpu2=$(head -n1 /proc/stat 2>/dev/null)\n"
            + "rx2=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')\n"
            + "tx2=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')\n"
            + "echo \"$cpu1\"\n"
            + "echo \"$cpu2\"\n"
            + "echo \"RX $rx1 $rx2\"\n"
            + "echo \"TX $tx1 $tx2\"\n"
            + "free -b 2>/dev/null | awk '/^Mem/{print \"MEM\",$2,$3,$7} /^Swap/{print \"SWAP\",$2,$3}'\n"
            + "df -B1 -P / 2>/dev/null | awk 'NR==2{print \"DISK\",$2,$3,$5}'\n"
            + "awk '{print \"LOAD\",$1,$2,$3}' /proc/loadavg 2>/dev/null\n"
            + "nproc 2>/dev/null | awk '{print \"CPU_N\",$1}'\n"
            + "awk '{print \"UPTIME\",int($1)}' /proc/uptime 2>/dev/null\n";

    static JSONObject parse(String raw) {
        JSONObject out = new JSONObject();
        try {
            out.put("cpu", 0);
            out.put("cores", 0);
            out.put("memTotal", 0L);
            out.put("memUsed", 0L);
            out.put("memAvail", 0L);
            out.put("swapTotal", 0L);
            out.put("swapUsed", 0L);
            out.put("diskTotal", 0L);
            out.put("diskUsed", 0L);
            out.put("diskPct", 0);
            out.put("rxRate", 0L);
            out.put("txRate", 0L);
            out.put("load", new JSONArray().put(0).put(0).put(0));
            out.put("uptime", 0L);

            String[] c1 = null, c2 = null;
            long rx1 = -1, rx2 = -1, tx1 = -1, tx2 = -1;
            for (String line : raw.split("\n")) {
                String[] p = line.trim().split("\\s+");
                if (p.length == 0 || p[0].isEmpty()) continue;
                switch (p[0]) {
                    case "cpu":
                        if (c1 == null) c1 = p; else c2 = p;
                        break;
                    case "RX":
                        if (p.length >= 3) { rx1 = num(p[1]); rx2 = num(p[2]); }
                        break;
                    case "TX":
                        if (p.length >= 3) { tx1 = num(p[1]); tx2 = num(p[2]); }
                        break;
                    case "MEM":
                        if (p.length >= 4) {
                            out.put("memTotal", num(p[1]));
                            out.put("memUsed", num(p[2]));
                            out.put("memAvail", num(p[3]));
                        }
                        break;
                    case "SWAP":
                        if (p.length >= 3) {
                            out.put("swapTotal", num(p[1]));
                            out.put("swapUsed", num(p[2]));
                        }
                        break;
                    case "DISK":
                        if (p.length >= 4) {
                            out.put("diskTotal", num(p[1]));
                            out.put("diskUsed", num(p[2]));
                            out.put("diskPct", (int) num(p[3]));
                        }
                        break;
                    case "LOAD":
                        if (p.length >= 4) {
                            out.put("load", new JSONArray()
                                    .put(fnum(p[1])).put(fnum(p[2])).put(fnum(p[3])));
                        }
                        break;
                    case "CPU_N":
                        if (p.length >= 2) out.put("cores", num(p[1]));
                        break;
                    case "UPTIME":
                        if (p.length >= 2) out.put("uptime", num(p[1]));
                        break;
                    default:
                        break;
                }
            }
            if (c1 != null && c2 != null) {
                double idle1 = at(c1, 4) + at(c1, 5);
                double idle2 = at(c2, 4) + at(c2, 5);
                double tot1 = sumFrom(c1, 1);
                double tot2 = sumFrom(c2, 1);
                double dt = tot2 - tot1, di = idle2 - idle1;
                if (dt > 0) {
                    out.put("cpu", Math.round(((dt - di) / dt) * 1000) / 10.0);
                }
            }
            if (rx1 >= 0) out.put("rxRate", Math.max(0, rx2 - rx1));
            if (tx1 >= 0) out.put("txRate", Math.max(0, tx2 - tx1));
        } catch (Exception ignored) {
            // Partial stats beat no stats; keep whatever fields parsed fine.
        }
        return out;
    }

    private static long num(String s) {
        try { return Long.parseLong(s.trim()); } catch (Exception e) { return 0; }
    }

    private static double fnum(String s) {
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return 0; }
    }

    private static double at(String[] arr, int i) {
        return i < arr.length ? fnum(arr[i]) : 0;
    }

    private static double sumFrom(String[] arr, int from) {
        double sum = 0;
        for (int i = from; i < arr.length; i++) sum += fnum(arr[i]);
        return sum;
    }
}
