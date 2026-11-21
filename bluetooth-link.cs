using System;
using System.IO;
using System.Text;
using System.Threading;
using Windows.Devices.Bluetooth.Rfcomm;
using Windows.Foundation;
using Windows.Networking.Sockets;
using Windows.Storage.Streams;

// Ghosttunes Bluetooth link: lets a paired phone reach this PC without shared Wi-Fi (or any network).
// Advertises an RFCOMM service; each connected phone exchanges JSON lines with the Ghosttunes
// server through this process's stdin/stdout:
//   stdout: {"conn":N,"open":true} / {"conn":N,"line":"<json>"} / {"conn":N,"open":false}
//   stdin:  {"conn":N,"line":"<json>"}   (written back to that phone)
// Built with the .NET Framework's own csc, which can't 'await' WinRT calls: Wait() polls instead.
class GtBluetoothLink
{
    static readonly Guid ServiceUuid = new Guid("6f3c2a10-9a41-4c6e-8b6e-47544e554e31");
    static readonly object Out = new object();
    static int nextConn = 0;
    static readonly System.Collections.Generic.Dictionary<int, DataWriter> Writers = new System.Collections.Generic.Dictionary<int, DataWriter>();

    static T Wait<T>(IAsyncOperation<T> op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(5);
        if (op.Status != AsyncStatus.Completed) throw op.ErrorCode ?? new Exception("operation " + op.Status);
        return op.GetResults();
    }

    static void Wait(IAsyncAction op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(5);
        if (op.Status != AsyncStatus.Completed) throw op.ErrorCode ?? new Exception("operation " + op.Status);
    }

    static void Emit(string json) { lock (Out) { Console.WriteLine(json); Console.Out.Flush(); } }
    static string Esc(string s) { return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " "); }

    static void Main()
    {
        RfcommServiceProvider provider;
        try
        {
            provider = Wait(RfcommServiceProvider.CreateAsync(RfcommServiceId.FromUuid(ServiceUuid)));
        }
        catch (Exception e)
        {
            Emit("{\"error\":\"" + Esc(e.Message) + "\"}");
            return;
        }
        var listener = new StreamSocketListener();
        listener.ConnectionReceived += (s, args) => { var socket = args.Socket; new Thread(() => Serve(socket)) { IsBackground = true }.Start(); };
        Wait(listener.BindServiceNameAsync(provider.ServiceId.AsString(), SocketProtectionLevel.BluetoothEncryptionAllowNullAuthentication));
        var sdp = new DataWriter();
        sdp.WriteByte(0x25); // SDP text, 1-byte length
        var name = Encoding.UTF8.GetBytes("Ghosttunes");
        sdp.WriteByte((byte)name.Length);
        sdp.WriteBytes(name);
        provider.SdpRawAttributes.Add(0x100, sdp.DetachBuffer());
        provider.StartAdvertising(listener, true);
        Emit("{\"ready\":true}");

        // stdin -> phones
        var stdin = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
        string line;
        while ((line = stdin.ReadLine()) != null)
        {
            int c1 = line.IndexOf("\"conn\":");
            int l1 = line.IndexOf("\"line\":\"");
            if (c1 < 0 || l1 < 0) continue;
            int end = line.IndexOfAny(new[] { ',', '}' }, c1 + 7);
            int conn;
            if (end < 0 || !int.TryParse(line.Substring(c1 + 7, end - c1 - 7).Trim(), out conn)) continue;
            string payload = line.Substring(l1 + 8, line.LastIndexOf('"') - l1 - 8).Replace("\\\"", "\"").Replace("\\\\", "\\");
            DataWriter w;
            lock (Writers) { Writers.TryGetValue(conn, out w); }
            if (w == null) continue;
            try { lock (w) { w.WriteString(payload + "\n"); Wait(w.StoreAsync()); } } catch { }
        }
    }

    static void Serve(StreamSocket socket)
    {
        int conn = Interlocked.Increment(ref nextConn);
        var writer = new DataWriter(socket.OutputStream);
        lock (Writers) { Writers[conn] = writer; }
        Emit("{\"conn\":" + conn + ",\"open\":true}");
        var reader = new DataReader(socket.InputStream) { InputStreamOptions = InputStreamOptions.Partial };
        var buffer = new StringBuilder();
        try
        {
            while (true)
            {
                uint n = Wait(reader.LoadAsync(4096));
                if (n == 0) break;
                buffer.Append(reader.ReadString(n));
                string text = buffer.ToString();
                int idx;
                while ((idx = text.IndexOf('\n')) >= 0)
                {
                    string msg = text.Substring(0, idx).Trim();
                    text = text.Substring(idx + 1);
                    if (msg.Length > 0) Emit("{\"conn\":" + conn + ",\"line\":\"" + Esc(msg) + "\"}");
                }
                buffer.Clear().Append(text);
            }
        }
        catch { }
        lock (Writers) { Writers.Remove(conn); }
        Emit("{\"conn\":" + conn + ",\"open\":false}");
        try { socket.Dispose(); } catch { }
    }
}
