plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "com.neto.assistant"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.neto.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "NETO_ORIGIN", "\"https://neto-fnp7.onrender.com\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
