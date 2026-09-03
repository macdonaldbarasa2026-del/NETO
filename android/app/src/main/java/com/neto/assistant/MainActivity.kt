package com.neto.assistant

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {
  private lateinit var webView: WebView
  private var fileChooser: ValueCallback<Array<Uri>>? = null
  private var nativeFilePicker = false
  private var recognizer: SpeechRecognizer? = null
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private val audioManager by lazy { getSystemService(AUDIO_SERVICE) as AudioManager }
  private val focusChange = AudioManager.OnAudioFocusChangeListener { if (it == AudioManager.AUDIOFOCUS_LOSS) stopSpeaking() }
  private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
    dispatch("capabilities", NetoAndroidController(this).capabilities())
  }
  private val files = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val callback = fileChooser
    if (callback == null && !nativeFilePicker) return@registerForActivityResult
    val data = result.data
    val value = if (result.resultCode != RESULT_OK || data == null) null else if (data.clipData != null) Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri } else data.data?.let { arrayOf(it) }
    callback?.onReceiveValue(value); fileChooser = null; nativeFilePicker = false; val first = value?.firstOrNull(); dispatch("file", JSONObject().put("state", if (first == null) "cancelled" else "selected").put("count", value?.size ?: 0).put("uri", first?.toString() ?: "").put("mimeType", first?.let { contentResolver.getType(it).orEmpty() } ?: ""))
  }
  @SuppressLint("SetJavaScriptEnabled") override fun onCreate(state: Bundle?) { super.onCreate(state)
    webView = WebView(this); setContentView(webView)
    webView.settings.apply { javaScriptEnabled=true; domStorageEnabled=true; mediaPlaybackRequiresUserGesture=false; allowFileAccess=false; allowContentAccess=true }
    webView.addJavascriptInterface(NetoBridge(this, webView), "NetoNative")
    webView.webViewClient=object: WebViewClient(){ override fun shouldOverrideUrlLoading(view:WebView, request:WebResourceRequest):Boolean { return if(trusted(request.url)) false else external(request.url) } }
    webView.webChromeClient=object: WebChromeClient(){
      override fun onPermissionRequest(request:PermissionRequest) { runOnUiThread { if(!trusted(request.origin)){request.deny();return@runOnUiThread}; val allow=mutableListOf<String>(); if(request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)&&has(Manifest.permission.RECORD_AUDIO))allow+=PermissionRequest.RESOURCE_AUDIO_CAPTURE; if(request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)&&has(Manifest.permission.CAMERA))allow+=PermissionRequest.RESOURCE_VIDEO_CAPTURE; if(allow.isEmpty())request.deny() else request.grant(allow.toTypedArray()) } }
      override fun onShowFileChooser(view:WebView, callback:ValueCallback<Array<Uri>>, params:FileChooserParams):Boolean { fileChooser?.onReceiveValue(null);fileChooser=callback;return try{files.launch(params.createIntent());true}catch(_:Exception){fileChooser=null;callback.onReceiveValue(null);false} }
    }
    webView.setDownloadListener { url,_,_,_,_-> external(Uri.parse(url)) }; tts=TextToSpeech(this,this); webView.loadUrl(BuildConfig.NETO_ORIGIN)
  }
  override fun onInit(status:Int) { ttsReady=status==TextToSpeech.SUCCESS; if(ttsReady) { tts?.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).build());tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String)=dispatch("tts",JSONObject().put("state","speaking"));override fun onDone(id:String){audioManager.abandonAudioFocus(focusChange);dispatch("tts",JSONObject().put("state","idle"))};@Deprecated("Deprecated in Java") override fun onError(id:String){audioManager.abandonAudioFocus(focusChange);dispatch("tts",JSONObject().put("state","error").put("message","Android text-to-speech failed."))}}) } }
  fun requestCapability(name:String):JSONObject { if(name=="accessibility"){openAccessibilitySettings();return NetoAndroidController.successResult("Enable NETO Accessibility Service, then return here.")}; val permission=when(name){"microphone"->Manifest.permission.RECORD_AUDIO;"camera"->Manifest.permission.CAMERA;"contacts"->Manifest.permission.READ_CONTACTS;"notifications"->if(Build.VERSION.SDK_INT>=33)Manifest.permission.POST_NOTIFICATIONS else null;else->return NetoAndroidController.failureResult("That permission is not supported.")};if(permission==null||has(permission))return NetoAndroidController.successResult("$name is already enabled.");if(permanentlyDenied(permission))return NetoAndroidController.failureResult("$name is blocked in Android settings. Open NETO app settings to allow it.","permanently_denied");getSharedPreferences("neto_permissions", MODE_PRIVATE).edit().putBoolean("requested_"+permission, true).apply();permissions.launch(arrayOf(permission));return NetoAndroidController.successResult("Android is asking for $name permission.") }
  fun startVoice(language:String):JSONObject { if(!has(Manifest.permission.RECORD_AUDIO)){requestCapability("microphone");return NetoAndroidController.failureResult("Allow microphone access, then tap Talk again.","permission_denied")};if(!SpeechRecognizer.isRecognitionAvailable(this))return NetoAndroidController.failureResult("Speech recognition is unavailable on this device.","speech_unavailable");stopVoice();recognizer=SpeechRecognizer.createSpeechRecognizer(this).also { r->r.setRecognitionListener(object:RecognitionListener{override fun onReadyForSpeech(p:Bundle?)=dispatch("voice",JSONObject().put("state","listening"));override fun onBeginningOfSpeech()=Unit;override fun onRmsChanged(v:Float)=dispatch("voice",JSONObject().put("state","level").put("value",((v+2)/14).coerceIn(0f,1f)));override fun onBufferReceived(b:ByteArray?)=Unit;override fun onEndOfSpeech()=dispatch("voice",JSONObject().put("state","thinking"));override fun onError(e:Int){dispatch("voice",JSONObject().put("state","error").put("message",voiceError(e)));stopVoice()};override fun onResults(b:Bundle?){emit(b,true);stopVoice()};override fun onPartialResults(b:Bundle?)=emit(b,false);override fun onEvent(t:Int,p:Bundle?)=Unit});r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE,language).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM))};return NetoAndroidController.successResult("Listening with Android speech recognition.") }
  private fun emit(b:Bundle?,final:Boolean){val text=b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty();if(text.isNotEmpty())dispatch("voice",JSONObject().put("state",if(final)"final" else "partial").put("text",text))}
  fun stopVoice():JSONObject {recognizer?.cancel();recognizer?.destroy();recognizer=null;return NetoAndroidController.successResult("Voice input stopped.")}
  fun speak(text:String,rate:Float):JSONObject {audioManager.requestAudioFocus(focusChange, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);if(!ttsReady||text.isBlank())return NetoAndroidController.failureResult("Android text-to-speech is unavailable.","tts_unavailable");tts?.setSpeechRate(rate.coerceIn(.7f,1.4f));return if(tts?.speak(text.take(8000),TextToSpeech.QUEUE_FLUSH,Bundle(),"neto")==TextToSpeech.ERROR)NetoAndroidController.failureResult("Android text-to-speech could not start.") else NetoAndroidController.successResult("Speaking.")}
  fun stopSpeaking():JSONObject {tts?.stop();audioManager.abandonAudioFocus(focusChange);return NetoAndroidController.successResult("Speech stopped.")}
  fun openFilePicker(target: String): JSONObject {
    if (nativeFilePicker) return NetoAndroidController.failureResult("A file picker is already open.", "file_picker_busy")
    return try { nativeFilePicker = true; files.launch(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")); NetoAndroidController.successResult("Opening ${if (target.contains("download", true)) "Downloads" else "Android's file picker"}.") }
    catch (_: Exception) { nativeFilePicker = false; NetoAndroidController.failureResult("I couldn't open the file picker.", "file_picker_unavailable") }
  }
  fun isTextToSpeechReady()=ttsReady
  fun isInternetAvailable():Boolean { val manager=getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager; val network=manager.activeNetwork ?: return false; val caps=manager.getNetworkCapabilities(network) ?: return false; return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) }
  fun openAccessibilitySettings()=startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); fun openAppSettings()=startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))); fun has(p:String)=ContextCompat.checkSelfPermission(this,p)==PackageManager.PERMISSION_GRANTED; fun permanentlyDenied(p:String)=getSharedPreferences("neto_permissions", MODE_PRIVATE).getBoolean("requested_"+p, false)&&!has(p)&&!shouldShowRequestPermissionRationale(p)
  fun dispatch(type:String,data:JSONObject){runOnUiThread { if(::webView.isInitialized&&trusted(Uri.parse(webView.url?:""))){val event=JSONObject().put("type",type).put("data",data).toString();webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('neto-native',{detail:JSON.parse("+JSONObject.quote(event)+")}));",null)}}}
  private fun voiceError(e:Int)=when(e){SpeechRecognizer.ERROR_NETWORK,SpeechRecognizer.ERROR_NETWORK_TIMEOUT->"Speech recognition needs a network connection.";SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS->"Allow microphone access to use voice.";SpeechRecognizer.ERROR_NO_MATCH,SpeechRecognizer.ERROR_SPEECH_TIMEOUT->"I did not hear anything. Tap Talk to try again.";else->"Speech recognition failed. Please try again."}
  private fun trusted(uri:Uri):Boolean{val base=Uri.parse(BuildConfig.NETO_ORIGIN);return uri.scheme==base.scheme&&uri.host==base.host&&uri.port==base.port}; private fun external(uri:Uri):Boolean=try{startActivity(Intent(Intent.ACTION_VIEW,uri));true}catch(_:Exception){true}
  override fun onResume(){super.onResume();if(::webView.isInitialized){webView.onResume();dispatch("capabilities",NetoAndroidController(this).capabilities())} };override fun onPause(){stopVoice();stopSpeaking();webView.onPause();super.onPause()};override fun onDestroy(){fileChooser?.onReceiveValue(null);stopVoice();tts?.shutdown();webView.destroy();super.onDestroy()};@Deprecated("Deprecated in Java") override fun onBackPressed(){if(webView.canGoBack())webView.goBack() else super.onBackPressed()}
}