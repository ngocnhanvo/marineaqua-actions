<?php
/**
 * Offline integration boundary: the real Marine callback and vendored WooCommerce
 * COD gateway run against bounded order/cart/storage doubles. No WP bootstrap,
 * network, database, email or real order is used. This is not live checkout QA.
 *
 * Usage: php scripts/marineaqua-checkout-cod-contract.test.php source-php
 */

$source = realpath( $argv[1] ?? '' );
if ( ! $source ) {
    throw new RuntimeException( 'Pass the checked-out PHP repository directory.' );
}
define( 'ABSPATH', $source . '/' );

class WP_Error {
    private $code;
    private $message;
    private $data;
    public function __construct( $code, $message, $data = array() ) {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }
    public function get_error_code() { return $this->code; }
    public function get_error_message() { return $this->message; }
    public function get_error_data() { return $this->data; }
}
function is_wp_error( $value ) { return $value instanceof WP_Error; }
function add_action( ...$args ) {}
function add_filter( ...$args ) {}
function apply_filters( $hook, $value, ...$args ) {
    if ( 'woocommerce_cod_process_payment_order_status' === $hook && $GLOBALS['cod_status_override'] ) {
        return $GLOBALS['cod_status_override'];
    }
    return $value;
}
function __( $text, $domain = null ) { return $text; }
function sanitize_text_field( $value ) { return is_scalar( $value ) ? trim( strip_tags( (string) $value ) ) : ''; }
function sanitize_textarea_field( $value ) { return sanitize_text_field( $value ); }
function sanitize_email( $value ) { return is_string( $value ) ? trim( $value ) : ''; }
function is_email( $value ) { return (bool) filter_var( $value, FILTER_VALIDATE_EMAIL ); }
function is_user_logged_in() { return false; }
function get_user_by( ...$args ) { return false; }
function wc_create_new_customer( ...$args ) { $GLOBALS['writes']['customers']++; return 700; }
function update_user_meta( ...$args ) { $GLOBALS['writes']['customer_meta']++; }
function wp_set_current_user( ...$args ) { $GLOBALS['writes']['auth']++; }
function wp_set_auth_cookie( ...$args ) { $GLOBALS['writes']['auth']++; }
function esc_is_paypal_gateway( $id ) { return false; }
function is_wc_endpoint_url( $endpoint ) { return false; }
function WC() { return $GLOBALS['woo']; }
function wc_get_order( $id ) {
    $order = $GLOBALS['created_order'];
    return $order && $order->get_id() === $id ? $order : false;
}
class WC_Validation {
    public static function is_phone( $phone ) { return (bool) preg_match( '/^[+0-9 ()-]+$/D', $phone ); }
}
class CoCart_Cart_Extension_Callback {}
class WC_Customer {
    public function __construct( $id ) { $GLOBALS['writes']['customer_meta']++; }
    public function __call( $name, $args ) { $GLOBALS['writes']['customer_meta']++; }
}
class WC_Order_Item_Product {
    public $values = array();
    public function __call( $name, $args ) { $this->values[$name] = $args; }
}
class WC_Order {
    public $values = array();
    public $items = array();
    public $coupons = array();
    public $status = 'pending';
    public $cart_hash = '';
    public $gateway;
    public $payment_complete_calls = 0;
    public function __call( $name, $args ) { $this->values[$name] = $args; }
    public function get_id() { return 901; }
    public function get_order_key() { return 'fixture-order-key'; }
    public function get_status() { return $this->status; }
    public function get_total() {
        return array_sum( array_map( function( $item ) { return $item->values['set_total'][0]; }, $this->items ) );
    }
    public function has_downloadable_item() { return $GLOBALS['fixture_downloadable']; }
    public function set_cart_hash( $hash ) { $this->cart_hash = $hash; }
    public function get_cart_hash() { return $this->cart_hash; }
    public function has_cart_hash( $hash = '' ) { return hash_equals( $this->get_cart_hash(), $hash ); }
    public function set_payment_method( $gateway ) { $this->gateway = $gateway; }
    public function get_payment_method() { return $this->gateway ? $this->gateway->id : ''; }
    public function add_item( $item ) { $this->items[] = $item; }
    public function apply_coupon( $coupon ) { $this->coupons[] = $coupon; }
    public function update_status( $status, $note = '' ) { $this->status = $status; }
    public function payment_complete() { $this->payment_complete_calls++; $this->status = 'completed'; }
}
function wc_create_order() {
    $GLOBALS['writes']['orders']++;
    $GLOBALS['created_order'] = new WC_Order();
    return $GLOBALS['created_order'];
}
class CodContractCart {
    public $items;
    public $hash = 'purchased-cart-hash';
    public $empty_calls = 0;
    public $calculations = 0;
    public $physical = true;
    public function __construct() {
        $this->items = array( array(
            'data' => (object) array( 'id' => 11 ), 'product_id' => 11,
            'variation_id' => 0, 'quantity' => 2, 'line_subtotal' => 100000,
            'line_total' => 90000, 'line_subtotal_tax' => 0, 'line_tax' => 0,
        ) );
    }
    public function get_cart() { return $this->items; }
    public function get_cart_hash() { return $this->items ? $this->hash : ''; }
    public function check_cart_item_validity() { return true; }
    public function check_cart_item_stock() { return true; }
    public function check_cart_item_sold_individually() { return true; }
    public function calculate_totals() { $this->calculations++; }
    public function get_applied_coupons() { return array( 'server-coupon' ); }
    public function needs_shipping() { return $this->physical; }
    public function get_shipping_methods() { return array(); }
    public function empty_cart() { $this->empty_calls++; $this->items = array(); }
}
class WC_Payment_Gateway {
    public $id;
    public $enabled = 'yes';
    public $title;
    public function is_available() { return 'yes' === $this->enabled; }
    public function get_return_url( $order ) {
        return 'https://checkout.example.test/order-received/' . $order->get_id() . '?key=' . $order->get_order_key();
    }
}

// Load the genuine COD implementation and constants from this exact source checkout.
require $source . '/wp-content/plugins/woocommerce/src/Enums/OrderStatus.php';
require $source . '/wp-content/plugins/woocommerce/includes/gateways/cod/class-wc-gateway-cod.php';

class CodContractGateway extends WC_Gateway_COD {
    public $replace_cart_before_payment = false;
    public $fail_before_payment = false;
    public function __construct() {
        // Configuration-only constructor avoids bootstrapping WordPress settings.
        $this->id = 'cod';
        $this->enabled = 'yes';
        $this->title = 'Thanh toán khi nhận hàng';
        $this->enable_for_methods = array();
        $this->enable_for_virtual = true;
    }
    public function process_payment( $order_id ) {
        $GLOBALS['writes']['gateway_calls']++;
        if ( $this->fail_before_payment ) { throw new RuntimeException( 'Fixture gateway failure' ); }
        if ( $this->replace_cart_before_payment ) { WC()->cart->hash = 'new-cart-hash'; }
        return parent::process_payment( $order_id );
    }
}
class CodContractOtherGateway extends WC_Payment_Gateway {
    public function __construct( $id, $enabled = 'yes' ) { $this->id = $id; $this->enabled = $enabled; }
    public function process_payment( $order_id ) {
        $GLOBALS['writes']['gateway_calls']++;
        $order = wc_get_order( $order_id );
        $order->update_status( 'on-hold' );
        return array( 'result' => 'success', 'redirect' => $this->get_return_url( $order ) );
    }
}
class CodContractGateways {
    public $registered;
    public function __construct() {
        $this->registered = array(
            'cod' => new CodContractGateway(),
            'bacs' => new CodContractOtherGateway( 'bacs' ),
            'onepayus' => new CodContractOtherGateway( 'onepayus', 'no' ),
        );
    }
    public function payment_gateways() { return $this->registered; }
    public function get_available_payment_gateways() {
        return array_filter( $this->registered, function( $gateway ) { return $gateway->is_available(); } );
    }
}
class CodContractWoo {
    public $cart;
    public $gateways;
    public function __construct() { $this->cart = new CodContractCart(); $this->gateways = new CodContractGateways(); }
    public function payment_gateways() { return $this->gateways; }
}
require $source . '/wp-content/themes/vibe-code-theme/inc/checkout/checkout_endpoint.php';

function cod_contract_reset() {
    $GLOBALS['woo'] = new CodContractWoo();
    $GLOBALS['created_order'] = null;
    $GLOBALS['writes'] = array( 'orders' => 0, 'customers' => 0, 'customer_meta' => 0, 'auth' => 0, 'gateway_calls' => 0 );
    $GLOBALS['fixture_downloadable'] = false;
    $GLOBALS['cod_status_override'] = null;
}
function cod_contract_request( $method = 'cod' ) {
    return array( 'data' => array(
        'terms' => true, 'payment_method' => $method, 'create_account' => false,
        'billing' => array( 'first_name' => 'Fixture customer', 'email' => 'cod@example.test',
            'phone' => '0900000000', 'address_1' => 'Offline fixture only' ),
    ) );
}
function cod_assert( $value, $message ) {
    if ( ! $value ) { throw new RuntimeException( $message ); }
}
function cod_case( $label, $test ) {
    cod_contract_reset();
    $test();
    echo 'PASS ' . $label . PHP_EOL;
}
function cod_success() {
    $response = ( new Checkout_Callback() )->callback( cod_contract_request(), null );
    cod_assert( ! is_wp_error( $response ) && 'success' === $response['result'], 'Native COD did not succeed.' );
    cod_assert( 1 === $GLOBALS['writes']['orders'] && 1 === $GLOBALS['writes']['gateway_calls'], 'COD must create/process exactly one fixture order.' );
    $order = $GLOBALS['created_order'];
    cod_assert( $order->gateway === WC()->gateways->registered['cod'], 'Order did not retain native COD gateway identity.' );
    cod_assert( $response['status'] === $order->get_status() && 901 === $response['order_id'] && 'fixture-order-key' === $response['order_key'], 'Native status/order receipt metadata was changed.' );
    cod_assert( $response['redirect'] === $order->gateway->get_return_url( $order ), 'Native receipt redirect was changed.' );
    cod_assert( $order->cart_hash === 'purchased-cart-hash', 'Order is not bound to the purchased server cart.' );
    return array( $response, $order );
}

cod_case( 'positive COD delegates to native processing and clears matching cart', function() {
    list( $response, $order ) = cod_success();
    cod_assert( 'processing' === $response['status'] && 0 === $order->payment_complete_calls, 'Positive COD must use native processing without payment_complete.' );
    cod_assert( 1 === WC()->cart->empty_calls && array() === WC()->cart->items, 'Native COD did not empty the matching purchased cart.' );
    cod_assert( 1 === WC()->cart->calculations && 90000 === $order->items[0]->values['set_total'][0], 'Server cart calculation/items were not preserved.' );
} );
cod_case( 'downloadable COD retains native on-hold status', function() {
    $GLOBALS['fixture_downloadable'] = true;
    list( $response, $order ) = cod_success();
    cod_assert( 'on-hold' === $response['status'] && 0 === $order->payment_complete_calls, 'Downloadable COD status/payment semantics changed.' );
} );
cod_case( 'native COD status filter remains authoritative', function() {
    $GLOBALS['cod_status_override'] = 'on-hold';
    list( $response, $order ) = cod_success();
    cod_assert( 'on-hold' === $response['status'] && 0 === $order->payment_complete_calls, 'Native status filter was bypassed.' );
} );
cod_case( 'zero-total COD retains native completion behavior', function() {
    WC()->cart->items[0]['line_subtotal'] = 0;
    WC()->cart->items[0]['line_total'] = 0;
    list( $response, $order ) = cod_success();
    cod_assert( 'completed' === $response['status'] && 1 === $order->payment_complete_calls, 'Zero-total native behavior was overridden.' );
} );
cod_case( 'COD does not empty a different cart', function() {
    WC()->gateways->registered['cod']->replace_cart_before_payment = true;
    cod_success();
    cod_assert( 0 === WC()->cart->empty_calls && 1 === count( WC()->cart->items ), 'Native COD erased a cart that no longer matched this order.' );
} );
cod_case( 'disabled OnePayUS is rejected before all customer/order writes', function() {
    $request = cod_contract_request( 'onepayus' );
    $request['data']['create_account'] = true;
    $request['data']['account_password'] = 'fixture-password';
    $response = ( new Checkout_Callback() )->callback( $request, null );
    cod_assert( is_wp_error( $response ) && 400 === $response->get_error_data()['status'], 'Disabled OnePayUS must fail preflight.' );
    cod_assert( 0 === array_sum( $GLOBALS['writes'] ) && 0 === WC()->cart->empty_calls, 'Disabled OnePayUS mutated state.' );
} );
cod_case( 'unavailable native COD is rejected before all writes', function() {
    WC()->cart->physical = false;
    WC()->gateways->registered['cod']->enable_for_virtual = false;
    $response = ( new Checkout_Callback() )->callback( cod_contract_request(), null );
    cod_assert( is_wp_error( $response ) && 400 === $response->get_error_data()['status'], 'Native COD availability must remain authoritative.' );
    cod_assert( 0 === array_sum( $GLOBALS['writes'] ) && 0 === WC()->cart->empty_calls, 'Unavailable COD mutated state.' );
} );
cod_case( 'BACS still delegates to its own configured gateway', function() {
    $response = ( new Checkout_Callback() )->callback( cod_contract_request( 'bacs' ), null );
    $order = $GLOBALS['created_order'];
    cod_assert( ! is_wp_error( $response ) && 'success' === $response['result'] && 'on-hold' === $response['status'], 'Existing BACS path changed.' );
    cod_assert( $order->gateway === WC()->gateways->registered['bacs'] && 1 === $GLOBALS['writes']['gateway_calls'], 'BACS gateway was replaced by COD.' );
    cod_assert( 0 === $order->payment_complete_calls, 'BACS path unexpectedly completed payment.' );
} );
cod_case( 'gateway failure stays uncertain and never clears or retries the cart', function() {
    WC()->gateways->registered['cod']->fail_before_payment = true;
    $response = ( new Checkout_Callback() )->callback( cod_contract_request(), null );
    cod_assert( is_wp_error( $response ) && 'checkout_outcome_uncertain' === $response->get_error_code() && 502 === $response->get_error_data()['status'], 'Post-order failure must remain uncertain.' );
    cod_assert( 1 === $GLOBALS['writes']['orders'] && 1 === $GLOBALS['writes']['gateway_calls'] && 0 === WC()->cart->empty_calls, 'Gateway failure retried or erased the cart.' );
} );

echo 'CHECKOUT_COD_CONTRACT=PASS (9 groups; actual vendored WC_Gateway_COD; storage/cart doubles; no live orders, accounts, payments or emails)' . PHP_EOL;
