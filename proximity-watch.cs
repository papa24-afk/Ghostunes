using System;
using System.Threading;
using Windows.Devices.Bluetooth.Advertisement;

// Listens for Ghosttunes phones (BLE manufacturer data 0xFFFF starting "GTUN") and prints one JSON line per sighting:
// {"rssi":-48,"id":"a1b2c3"}  ->  read by the Ghosttunes server to detect "phone brought close".
class GtBleWatch
{
    static void Main()
    {
        var watcher = new BluetoothLEAdvertisementWatcher { ScanningMode = BluetoothLEScanningMode.Passive };
        watcher.Received += (w, e) =>
        {
            foreach (var m in e.Advertisement.ManufacturerData)
            {
                if (m.CompanyId != 0xFFFF || m.Data.Length < 4) continue;
                var bytes = new byte[m.Data.Length];
                Windows.Storage.Streams.DataReader.FromBuffer(m.Data).ReadBytes(bytes);
                if (bytes[0] != 0x47 || bytes[1] != 0x54 || bytes[2] != 0x55 || bytes[3] != 0x4E) continue;
                var id = BitConverter.ToString(bytes, 4, Math.Min(4, bytes.Length - 4)).Replace("-", "").ToLowerInvariant();
                Console.WriteLine("{\"rssi\":" + e.RawSignalStrengthInDBm + ",\"id\":\"" + id + "\"}");
                Console.Out.Flush();
            }
        };
        watcher.Stopped += (w, e) => { Console.WriteLine("{\"stopped\":\"" + e.Error + "\"}"); Console.Out.Flush(); };
        watcher.Start();
        Console.WriteLine("{\"ready\":\"" + watcher.Status + "\"}");
        Console.Out.Flush();
        Thread.Sleep(Timeout.Infinite);
    }
}
